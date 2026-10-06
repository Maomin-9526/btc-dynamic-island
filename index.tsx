import { LiveActivity, Script } from "scripting"
import { ACTIVITY_NAME, BTCActivity } from "./live_activity"
import type { BTCState } from "./live_activity"

const RECORD_KEY = "btc.island.manual.v1"
const QUOTE_URL = "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"

type ActivityRecord = { id: string; state: BTCState }

async function loadQuote(): Promise<BTCState> {
  const response = await fetch(QUOTE_URL, { timeout: 12 })
  if (!response.ok) throw new Error(`行情请求失败：HTTP ${response.status}`)
  const payload = await response.json()
  const ticker = payload.data?.[0]
  if (payload.code !== "0" || ticker?.instId !== "BTC-USDT") {
    throw new Error(payload.msg || "行情接口返回了无效数据")
  }
  const price = Number(ticker.last)
  const opening = Number(ticker.open24h)
  const timestamp = Number(ticker.ts)
  if (![price, opening, timestamp].every(Number.isFinite) ||
      price <= 0 || opening <= 0 || timestamp <= 0) {
    throw new Error("行情价格或时间无效")
  }
  if (Date.now() - timestamp > 300000) {
    throw new Error("行情数据超过 5 分钟，拒绝显示为新报价")
  }
  const change = (price / opening - 1) * 100
  return {
    price: price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    compactPrice: String(Math.round(price)),
    change: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
    time: new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false }),
  }
}

async function run() {
  const choice = await Dialog.actionSheet({
    title: "BTC 灵动岛 v1.0.1",
    message: "BTC/USDT · OKX 公共行情。此版本仅手动刷新。",
    actions: [
      { label: "开始显示 / 刷新价格" },
      { label: "停止显示", destructive: true },
    ],
  })
  if (choice == null) return

  const record = Storage.get<ActivityRecord>(RECORD_KEY)
  const status = record ? await LiveActivity.getActivityState(record.id) : null
  const activity = record && (status === "active" || status === "stale")
    ? LiveActivity.from(record.id, ACTIVITY_NAME)
    : null

  if (choice === 1) {
    if (activity && record) {
      await activity.end(record.state, { dismissTimeInterval: 0 })
    }
    Storage.remove(RECORD_KEY)
    await Dialog.alert({ title: "BTC 灵动岛", message: "已停止显示。" })
    return
  }

  if (!await LiveActivity.areActivitiesEnabled()) {
    throw new Error("请在设置 → App → Scripting 中允许实时活动，再运行。")
  }
  const state = await loadQuote()
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
    message: `${state.price} USDT\n24h ${state.change}\n行情时间 ${state.time}\n\n返回主屏幕查看；下次运行本脚本即可刷新。`,
    buttonLabel: "完成",
  })
}

async function main() {
  try {
    console.log("BTC 灵动岛 v1.0.1：入口已启动")
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
