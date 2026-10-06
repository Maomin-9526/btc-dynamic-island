import type { BTCState } from "./live_activity"

export type SourceId = "bitget" | "binance" | "okx"
export type SourcePreference = SourceId | "auto"

type QuoteEndpoint = {
  source: SourceId
  host: string
  url: string
}

export const SOURCE_OPTIONS: { id: SourcePreference; label: string }[] = [
  { id: "auto", label: "自动选择可用源（推荐）" },
  { id: "bitget", label: "Bitget" },
  { id: "binance", label: "币安 Binance" },
  { id: "okx", label: "OKX" },
]

const SOURCE_NAMES: Record<SourceId, string> = {
  bitget: "Bitget",
  binance: "Binance",
  okx: "OKX",
}

const ENDPOINTS: QuoteEndpoint[] = [
  {
    source: "bitget",
    host: "api.bitget.com",
    url: "https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT",
  },
  {
    source: "binance",
    host: "data-api.binance.vision",
    url: "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT",
  },
  {
    source: "binance",
    host: "api.binance.com",
    url: "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
  },
  {
    source: "okx",
    host: "www.okx.com",
    url: "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
  },
]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("接口没有返回有效的行情对象")
  }
  return value as Record<string, unknown>
}

function asNumber(value: unknown, field: string, positive = false): number {
  if ((typeof value !== "string" && typeof value !== "number") ||
      (typeof value === "string" && value.trim() === "")) {
    throw new Error(`行情字段 ${field} 无效`)
  }
  const number = Number(value)
  if (!Number.isFinite(number) || (positive && number <= 0)) {
    throw new Error(`行情字段 ${field} 无效`)
  }
  return number
}

function findTicker(data: unknown, field: string, symbol: string) {
  if (!Array.isArray(data)) throw new Error("接口没有返回行情列表")
  const ticker = data.find(item => item != null && item[field] === symbol)
  if (!ticker) throw new Error("接口没有返回 BTC/USDT 现货行情")
  return asObject(ticker)
}

export function parseQuote(source: SourceId, value: unknown): BTCState {
  const payload = asObject(value)
  let price: number
  let change: number
  let timestamp: number

  if (source === "binance") {
    if (payload.symbol !== "BTCUSDT") {
      throw new Error(String(payload.msg || "接口没有返回 BTC/USDT 现货行情"))
    }
    price = asNumber(payload.lastPrice, "lastPrice", true)
    change = asNumber(payload.priceChangePercent, "priceChangePercent")
    timestamp = asNumber(payload.closeTime, "closeTime", true)
  } else if (source === "bitget") {
    if (payload.code !== "00000") {
      throw new Error(String(payload.msg || "Bitget 行情接口返回错误"))
    }
    const ticker = findTicker(payload.data, "symbol", "BTCUSDT")
    price = asNumber(ticker.lastPr, "lastPr", true)
    change = asNumber(ticker.change24h, "change24h") * 100
    timestamp = asNumber(ticker.ts, "ts", true)
  } else {
    if (payload.code !== "0") {
      throw new Error(String(payload.msg || "OKX 行情接口返回错误"))
    }
    const ticker = findTicker(payload.data, "instId", "BTC-USDT")
    price = asNumber(ticker.last, "last", true)
    change = (price / asNumber(ticker.open24h, "open24h", true) - 1) * 100
    timestamp = asNumber(ticker.ts, "ts", true)
  }

  if (!Number.isFinite(change)) throw new Error("24 小时涨跌幅无效")
  const age = Date.now() - timestamp
  if (age > 300000) throw new Error("行情超过 5 分钟，拒绝显示为新报价")
  if (age < -60000) throw new Error("行情时间在未来，请检查手机的日期与时间")

  return {
    price: price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    compactPrice: price.toFixed(2),
    change: `${change < 0 ? "" : "+"}${change.toFixed(2)}%`,
    time: new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false }),
    source: SOURCE_NAMES[source],
  }
}

async function requestQuote(endpoint: QuoteEndpoint): Promise<BTCState> {
  const response = await fetch(endpoint.url, {
    timeout: 6,
    headers: { "Cache-Control": "no-cache" },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseQuote(endpoint.source, await response.json())
}

export async function loadQuote(preference: SourcePreference) {
  const endpoints = ENDPOINTS.filter(endpoint =>
    preference === "auto" || endpoint.source === preference)
  const failures: string[] = []
  for (const endpoint of endpoints) {
    try {
      console.log(`请求行情：${endpoint.host}`)
      const state = await requestQuote(endpoint)
      return { state, host: endpoint.host, failures }
    } catch (error) {
      failures.push(`${endpoint.host}：${errorMessage(error)}`)
    }
  }
  const advice = preference === "auto"
    ? "当前网络没有取得可用报价。请检查 Scripting 的蜂窝数据权限，或换 Wi-Fi 再测试。多源不能保证所有国内运营商都能直连。"
    : "这个行情源在当前网络不可用。请到“行情源设置”选择自动模式或其他来源。"
  throw new Error(`${advice}\n\n${failures.join("\n")}`)
}

export async function testConnections(): Promise<string[]> {
  return Promise.all(ENDPOINTS.map(async endpoint => {
    const started = Date.now()
    try {
      const state = await requestQuote(endpoint)
      return `✓ ${SOURCE_NAMES[endpoint.source]} · ${endpoint.host}\n${state.compactPrice} USDT · ${((Date.now() - started) / 1000).toFixed(1)} 秒`
    } catch (error) {
      return `✗ ${SOURCE_NAMES[endpoint.source]} · ${endpoint.host}\n${errorMessage(error)}`
    }
  }))
}
