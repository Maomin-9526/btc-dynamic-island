import { LiveActivity, Script } from "scripting"
import { ACTIVITY_NAME, BTCActivity } from "./live_activity"
import type { BTCState } from "./live_activity"
import { loadQuote, SOURCE_OPTIONS, testConnections } from "./quotes"
import type { SourcePreference } from "./quotes"

const RECORD_KEY = "btc.island.manual.v1"
const SETTINGS_KEY = "btc.island.settings.v1"

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
    message: "自动模式依次尝试 Bitget、币安行情专用域名、币安主域名、OKX。固定来源不会偷偷切到其他交易所。国内可达性以本机网络测试为准。",
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
    ? LiveActivity.from(record.id, ACTIVITY_NAME)
    : null
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

async function refreshActivity(settings: Settings) {
  if (!await LiveActivity.areActivitiesEnabled()) {
    throw new Error("请在设置 → App → Scripting 中允许实时活动，再运行。")
  }
  const { state, host, failures } = await loadQuote(settings.source)
  const { record, activity } = await getSavedActivity()
  const options = { staleDate: Date.now() + 120000 }

  if (activity && record) {
    await activity.update(state, options)
    Storage.set(RECORD_KEY, { id: record.id, state })
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

  await Dialog.alert({
    title: "已更新 BTC 行情",
    message: `${state.price} USDT\n24h ${state.change}\n行情时间 ${state.time}\n来源 ${state.source}\n接口 ${host}${failures.length ? `\n已跳过 ${failures.length} 个不可用接口` : ""}\n\n灵动岛保留两位小数。返回主屏幕查看；下次运行本脚本即可刷新。`,
    buttonLabel: "完成",
  })
}

async function run() {
  let settings = readSettings()
  while (true) {
    const source = SOURCE_OPTIONS.find(option => option.id === settings.source)!
    const choice = await Dialog.actionSheet({
      title: "BTC 灵动岛 v1.1.0",
      message: `BTC/USDT 现货 · 两位小数 · 手动刷新\n当前来源：${source.label}`,
      cancelButton: true,
      actions: [
        { label: "开始显示 / 刷新价格" },
        { label: "行情源设置" },
        { label: "测试当前网络（不更新价格）" },
        { label: "停止显示", destructive: true },
      ],
    })
    if (choice == null) return
    if (choice === 0) {
      await refreshActivity(settings)
      return
    }
    if (choice === 1) {
      settings = await chooseSource(settings)
    } else if (choice === 2) {
      const results = await testConnections()
      await Dialog.alert({
        title: "当前网络测试结果",
        message: `${results.join("\n\n")}\n\n这只代表此刻本机的连通性，不保证长期可用。测试不会修改行情源或灵动岛价格。`,
        buttonLabel: "返回菜单",
      })
    } else if (choice === 3) {
      await stopActivity()
      return
    }
  }
}

async function main() {
  try {
    console.log("BTC 灵动岛 v1.1.0：入口已启动")
    await run()
  } catch (error) {
    console.error("BTC 灵动岛运行失败", error)
    await Dialog.alert({
      title: "未能完成",
      message: `${error instanceof Error ? error.message : String(error)}\n\n网络失败时，不会把旧价格当作新报价。`,
    })
  } finally {
    Script.exit()
  }
}

main()
