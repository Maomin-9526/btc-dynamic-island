import { LiveActivity, Script } from "scripting"
import { createRefreshLoop, REFRESH_SECONDS } from "./auto_refresh"
import type { RefreshLoop } from "./auto_refresh"
import { BackgroundLocationError, startBackgroundLocation } from "./background_location"
import type { BackgroundLocationSession } from "./background_location"
import { ACTIVITY_NAME, BTCActivity } from "./live_activity"
import type { BTCState } from "./live_activity"
import { loadQuote, QuoteUnavailableError, SOURCE_OPTIONS, testConnections } from "./quotes"
import type { SourcePreference } from "./quotes"

const RECORD_KEY = "btc.island.manual.v1"
const SETTINGS_KEY = "btc.island.settings.v1"
const VERSION = "1.4.0"

type ActivityRecord = { id: string; state: BTCState }
type Settings = { source: SourcePreference }

function readSettings(): Settings {
  const saved = Storage.get<Settings>(SETTINGS_KEY)
  return SOURCE_OPTIONS.some(option => option.id === saved?.source)
    ? { source: saved!.source }
    : { source: "auto" }
}

async function chooseSource(settings: Settings): Promise<Settings> {
  const choice = await Dialog.actionSheet({
    title: "行情源设置",
    message: "BG 优先用官方 WebSocket，OKX 优先用专用 API 域名，并在同一交易所内尝试备用通道。固定来源不会切到其他交易所；自动模式按 BG、币安、OKX 尝试。国内可达性仍需本机测试。",
    cancelButton: true,
    actions: SOURCE_OPTIONS.map(option => ({
      label: `${settings.source === option.id ? "✓ " : ""}${option.label}`,
    })),
  })
  const selected = choice == null ? null : SOURCE_OPTIONS[choice]
  if (!selected) return settings
  const updated = { source: selected.id }
  if (!Storage.set(SETTINGS_KEY, updated)) {
    throw new Error("无法保存行情源设置，请检查 Scripting 存储后重试。")
  }
  return updated
}

async function getSavedActivity() {
  const record = Storage.get<ActivityRecord>(RECORD_KEY)
  const status = record ? await LiveActivity.getActivityState(record.id) : null
  const activity = record && (status === "active" || status === "stale")
    ? await LiveActivity.from(record.id, ACTIVITY_NAME)
    : null
  if (activity && (typeof activity.update !== "function" ||
                   typeof activity.end !== "function")) {
    throw new Error("实时活动恢复结果缺少 update/end 方法，未执行刷新或停止。请提供本提示和 Scripting 应用版本，以便核对接口兼容性。")
  }
  return { record, activity }
}

async function stopActivity() {
  const { record, activity } = await getSavedActivity()
  if (activity && record) {
    await activity.end(record.state, { dismissTimeInterval: 0 })
  }
  Storage.remove(RECORD_KEY)
  await Dialog.alert({ title: "BTC 灵动岛", message: "已停止显示。" })
}

async function refreshActivity(settings: Settings, allowStart = true) {
  if (!await LiveActivity.areActivitiesEnabled()) {
    throw new Error("请在设置 → App → Scripting 中允许实时活动，再运行。")
  }
  if (!allowStart && !(await getSavedActivity()).activity) return null
  const quote = await loadQuote(settings.source)
  const state = { ...quote.state, refreshSeconds: REFRESH_SECONDS }
  const { record, activity } = await getSavedActivity()
  if (!activity && !allowStart) return null
  const options = { staleDate: Date.now() + 120000 }

  if (activity && record) {
    await activity.update(state, options)
    if (!Storage.set(RECORD_KEY, { id: record.id, state })) {
      throw new Error("无法保存活动状态，请检查 Scripting 存储后重试。")
    }
  } else {
    const previousIds = new Set(await LiveActivity.getAllActivitiesIds())
    const freshActivity = BTCActivity()
    if (!await freshActivity.start(state, options)) {
      throw new Error("启动失败。请检查实时活动权限，或关闭多余的实时活动。")
    }
    try {
      const createdIds = (await LiveActivity.getAllActivitiesIds())
        .filter(activityId => !previousIds.has(activityId))
      if (createdIds.length !== 1) {
        throw new Error("未能识别新活动。请勿同时运行多个脚本，稍后重试。")
      }
      if (!Storage.set(RECORD_KEY, { id: createdIds[0], state })) {
        throw new Error("无法保存活动状态，请检查 Scripting 存储后重试。")
      }
    } catch (error) {
      await freshActivity.end(state, { dismissTimeInterval: 0 })
      throw error
    }
  }

  return { ...quote, state }
}

async function run() {
  let settings = readSettings()
  let loop: RefreshLoop | null = null
  let menuOpen = false
  let stopping = false
  let finished = false
  let backgroundLocation: BackgroundLocationSession | null = null
  let lastError = ""
  let finishSession!: () => void
  const session = new Promise<void>(resolve => { finishSession = resolve })

  function finish() {
    finished = true
    finishSession()
  }

  async function releaseLocation() {
    const activeLocation = backgroundLocation
    backgroundLocation = null
    await activeLocation?.stop()
  }

  async function stopRefreshing() {
    const stopped = loop?.stop()
    try {
      await releaseLocation()
    } finally {
      await stopped
    }
  }

  function locationStatus() {
    if (!backgroundLocation) return "定位未启用 · 仅前台刷新"
    const lastUpdate = backgroundLocation.lastUpdateTime
    return `实验定位已请求（不代表后台验证成功）\n${lastUpdate === null
      ? "尚未收到定位回调"
      : `最近定位回调：${Math.max(0, Math.floor((Date.now() - lastUpdate) / 1000))} 秒前`}`
  }

  async function minimize() {
    if (typeof Script.supportsMinimization === "function" &&
        typeof Script.minimize === "function" && Script.supportsMinimization()) {
      await Script.minimize()
    }
  }

  async function startAutomaticRefresh(useLocation = true) {
    if (typeof Script.onResume !== "function") {
      throw new Error("当前 Scripting 版本缺少脚本恢复接口，请更新 Scripting 后重试，以便自动运行时还能打开停止菜单。")
    }

    let quote: Awaited<ReturnType<typeof refreshActivity>>
    try {
      if (useLocation) backgroundLocation = await startBackgroundLocation()
      quote = await refreshActivity(settings)
      if (!quote) {
        await releaseLocation()
        return
      }
    } catch (error) {
      await releaseLocation()
      throw error
    }

    loop = createRefreshLoop(async () => {
      if (menuOpen) return true
      const updated = await refreshActivity(settings, false)
      if (!updated) return false
      lastError = ""
      return true
    }, error => {
      lastError = error instanceof Error ? error.message : String(error)
      console.error("本轮自动刷新失败，保留旧报价并在下一轮重试", error)
    })
    void loop.done.then(() => {
      if (!menuOpen && !stopping) finish()
    }, error => {
      console.error("自动刷新循环已停止", error)
      if (!menuOpen && !stopping) finish()
    })

    await Dialog.alert({
      title: backgroundLocation ? "已开启实验定位刷新" : "已开启前台自动刷新",
      message: `${quote.state.price} USDT\n24h ${quote.state.change}\n行情时间 ${quote.state.time}\n来源 ${quote.state.source}\n接口 ${quote.host} · ${quote.transport}\n\n每轮完成后间隔 ${REFRESH_SECONDS} 秒刷新；失败保留旧价格并自动重试，不重复弹窗。\n\n${backgroundLocation
        ? "已确认始终定位权限并请求后台定位；不读取、保存或上传经纬度。定位会增加耗电并保留系统指示。这不是 APNs 推送，也不保证切换 App 后持续运行；需真机验证。"
        : "未请求定位，也不调用 Pro 后台保活。本次仅在脚本获得运行时间时自动刷新；切后台后可能暂停。"}\n\n重新运行本脚本可打开菜单，关闭定位或停止刷新。不要强制关闭 Scripting；以行情时间而非价格是否变化判断是否更新。`,
      buttonLabel: "开始查看",
    })
  }

  async function showMenu() {
    if (menuOpen || finished) return
    menuOpen = true
    try {
      while (!finished) {
        const source = SOURCE_OPTIONS.find(option => option.id === settings.source)!
        const choice = await Dialog.actionSheet({
          title: `BTC 灵动岛 v${VERSION}`,
          message: `BTC/USDT 现货 · 两位小数 · ${REFRESH_SECONDS} 秒刷新间隔\n当前来源：${source.label}\n${loop?.running
            ? `自动刷新已启动 · ${locationStatus()}`
            : "未启动；可选择实验定位后台刷新，或不定位的前台刷新。"}${lastError ? `\n最近刷新失败，正在重试：${lastError.slice(0, 180)}` : ""}\n实验模式需始终允许定位，会增加耗电；不保存或上传位置。请勿同时运行其他连续定位脚本。系统仍可能暂停，请以行情时间为准。`,
          cancelButton: true,
          actions: [
            { label: loop?.running ? "继续自动刷新（返回查看）" : "开始显示 / 实验定位后台刷新" },
            { label: "行情源设置" },
            { label: "测试当前网络（不更新价格）" },
            { label: loop?.running
              ? backgroundLocation ? "关闭定位 / 切为前台刷新" : "开启实验定位后台刷新"
              : "开始显示 / 仅前台刷新（不定位）" },
            { label: "停止自动刷新 / 隐藏价格", destructive: true },
          ],
        })
        if (choice == null) {
          if (loop?.running) await minimize()
          else finish()
          return
        }
        if (choice === 0) {
          if (!loop?.running) await startAutomaticRefresh()
          await minimize()
          return
        }
        if (choice === 1) {
          settings = await chooseSource(settings)
        } else if (choice === 2) {
          const results = await testConnections(settings.source)
          await Dialog.alert({
            title: "当前网络测试结果",
            message: `${results.join("\n\n")}\n\n这只代表此刻本机的连通性，不保证长期可用。测试不会修改行情源或灵动岛价格。`,
            buttonLabel: "返回菜单",
          })
        } else if (choice === 3) {
          if (!loop?.running) {
            await startAutomaticRefresh(false)
            await minimize()
            return
          }
          if (backgroundLocation) {
            await releaseLocation()
            await Dialog.alert({ title: "实验定位已关闭", message: "已释放定位请求，行情循环仍保留。本次改为仅前台刷新，切换 App 后可能暂停。" })
          } else {
            backgroundLocation = await startBackgroundLocation()
            await Dialog.alert({ title: "实验定位已请求", message: "已确认始终定位权限并请求后台定位，不保存或上传位置。定位会增加耗电；这不是推送，后台效果需真机验证。" })
          }
          await minimize()
          return
        } else if (choice === 4) {
          stopping = true
          try {
            await stopRefreshing()
          } finally {
            await stopActivity()
          }
          finish()
          return
        }
      }
    } catch (error) {
      await reportError(error)
      if (stopping || !loop?.running) finish()
    } finally {
      menuOpen = false
      if (!loop?.running) finish()
    }
  }

  const removeResume = typeof Script.onResume === "function"
    ? Script.onResume(() => {
      void showMenu().catch(error => {
        console.error("无法显示自动刷新控制菜单", error)
        finish()
      })
    })
    : () => {}

  try {
    await showMenu()
    await session
  } finally {
    stopping = true
    try {
      removeResume()
    } finally {
      await stopRefreshing()
    }
  }
}

async function reportError(error: unknown) {
  console.error("BTC 灵动岛运行失败", error)
  const quoteUnavailable = error instanceof QuoteUnavailableError
  const locationUnavailable = error instanceof BackgroundLocationError
  await Dialog.alert({
    title: quoteUnavailable ? "行情暂不可用" : locationUnavailable ? "实验定位失败" : "脚本运行失败",
    message: `${error instanceof Error ? error.message : String(error)}\n\n${quoteUnavailable
      ? "本次未更新活动，不会把旧价格当作新报价。"
      : locationUnavailable ? "不代表行情接口故障；不会调用 Pro 后台保活，也不会自动购买服务。"
      : "这是脚本或实时活动处理失败，不等于行情网络不可达。请保留本提示截图。"}`,
  })
}

async function main() {
  try {
    console.log(`BTC 灵动岛 v${VERSION}：入口已启动`)
    await run()
  } catch (error) {
    await reportError(error)
  } finally {
    Script.exit()
  }
}

main()
