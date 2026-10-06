import { BackgroundKeeper, LiveActivity, Script } from "scripting"
import { createRefreshLoop, REFRESH_SECONDS } from "./auto_refresh"
import type { RefreshLoop } from "./auto_refresh"
import { ACTIVITY_NAME, BTCActivity } from "./live_activity"
import type { BTCState } from "./live_activity"
import { loadQuote, QuoteUnavailableError, SOURCE_OPTIONS, testConnections } from "./quotes"
import type { SourcePreference } from "./quotes"

const RECORD_KEY = "btc.island.manual.v1"
const SETTINGS_KEY = "btc.island.settings.v1"
const VERSION = "1.3.0"

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
  let keepAliveRequested = false
  let backgroundEnabled = false
  let lastError = ""
  let finishSession!: () => void
  const session = new Promise<void>(resolve => { finishSession = resolve })

  function finish() {
    finished = true
    finishSession()
  }

  async function stopRefreshing() {
    await loop?.stop()
  }

  async function minimize() {
    if (typeof Script.supportsMinimization === "function" &&
        typeof Script.minimize === "function" && Script.supportsMinimization()) {
      await Script.minimize()
    }
  }

  async function startAutomaticRefresh() {
    if (typeof Script.onResume !== "function") {
      throw new Error("当前 Scripting 版本缺少脚本恢复接口，请更新 Scripting 后重试，以便自动运行时还能打开停止菜单。")
    }

    const quote = await refreshActivity(settings)
    if (!quote) return
    if (typeof BackgroundKeeper !== "undefined" &&
        typeof BackgroundKeeper.keepAlive === "function") {
      keepAliveRequested = true
      try {
        backgroundEnabled = await BackgroundKeeper.keepAlive()
      } catch (error) {
        console.error("后台保活未启用，使用前台自动刷新", error)
      }
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
      title: backgroundEnabled ? "已开启自动刷新" : "已开启前台自动刷新",
      message: `${quote.state.price} USDT\n24h ${quote.state.change}\n行情时间 ${quote.state.time}\n来源 ${quote.state.source}\n接口 ${quote.host} · ${quote.transport}\n\n每轮完成后间隔 ${REFRESH_SECONDS} 秒刷新；失败保留旧价格并自动重试，不重复弹窗。\n\n${backgroundEnabled
        ? "已请求后台保活，可返回主屏幕查看。iOS 仍可能暂停或终止运行；不要强制关闭 Scripting。"
        : "后台保活未启用，可能需要 Scripting Pro 或更新应用。本次仅在脚本获得运行时间时自动刷新；切后台或锁屏后可能暂停。"}\n\n重新运行本脚本可打开菜单；选“停止自动刷新 / 隐藏价格”即可停止。请以行情时间判断报价是否更新。`,
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
            ? `自动刷新已启动 · ${backgroundEnabled ? "已请求后台保活" : "后台保活未启用"}`
            : "自动刷新未启动"}${lastError ? `\n最近刷新失败，正在重试：${lastError.slice(0, 180)}` : ""}\n系统可能暂停后台运行，请以行情时间为准。`,
          cancelButton: true,
          actions: [
            { label: loop?.running ? "继续自动刷新（返回查看）" : "开始显示 / 开启自动刷新" },
            { label: "行情源设置" },
            { label: "测试当前网络（不更新价格）" },
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
          stopping = true
          await stopRefreshing()
          await stopActivity()
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
    removeResume()
    await stopRefreshing()
    if (keepAliveRequested) {
      try {
        await BackgroundKeeper.stopKeepAlive()
      } catch (error) {
        console.error("释放后台保活请求失败，脚本仍将退出", error)
      }
    }
  }
}

async function reportError(error: unknown) {
  console.error("BTC 灵动岛运行失败", error)
  const quoteUnavailable = error instanceof QuoteUnavailableError
  await Dialog.alert({
    title: quoteUnavailable ? "行情暂不可用" : "脚本运行失败",
    message: `${error instanceof Error ? error.message : String(error)}\n\n${quoteUnavailable
      ? "本次未更新活动，不会把旧价格当作新报价。"
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
