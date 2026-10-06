import type { BTCState } from "./live_activity"

export class QuoteUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "QuoteUnavailableError"
  }
}

export type SourceId = "bitget" | "binance" | "okx"
export type SourcePreference = SourceId | "auto"

type QuoteEndpoint = {
  source: SourceId
  host: string
  url: string
  transport: "REST" | "WebSocket"
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
    host: "ws.bitget.com",
    url: "wss://ws.bitget.com/v2/ws/public",
    transport: "WebSocket",
  },
  {
    source: "bitget",
    host: "api.bitget.com",
    url: "https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT",
    transport: "REST",
  },
  {
    source: "binance",
    host: "data-api.binance.vision",
    url: "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT",
    transport: "REST",
  },
  {
    source: "binance",
    host: "api.binance.com",
    url: "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
    transport: "REST",
  },
  {
    source: "okx",
    host: "openapi.okx.com",
    url: "https://openapi.okx.com/api/v5/market/ticker?instId=BTC-USDT",
    transport: "REST",
  },
  {
    source: "okx",
    host: "ws.okx.com",
    url: "wss://ws.okx.com/ws/v5/public",
    transport: "WebSocket",
  },
  {
    source: "okx",
    host: "www.okx.com",
    url: "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
    transport: "REST",
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

export function parseWebSocketQuote(source: SourceId, value: unknown): BTCState | null {
  const payload = asObject(value)
  if (payload.event === "error") {
    throw new Error(`订阅被拒绝：${String(payload.code || "")} ${String(payload.msg || "未知错误")}`)
  }
  if (!Array.isArray(payload.data) || payload.data.length === 0) return null
  const argument = asObject(payload.arg)
  if (source === "bitget") {
    if (argument.instType !== "SPOT" || argument.channel !== "ticker" ||
        argument.instId !== "BTCUSDT") return null
    const ticker = findTicker(payload.data, "instId", "BTCUSDT")
    return parseQuote("bitget", {
      code: "00000",
      data: [{ ...ticker, symbol: ticker.instId }],
    })
  }
  if (source === "okx") {
    if (argument.channel !== "tickers" || argument.instId !== "BTC-USDT") return null
    const ticker = findTicker(payload.data, "instId", "BTC-USDT")
    if (ticker.instType !== "SPOT") throw new Error("通道返回的不是现货行情")
    return parseQuote("okx", { code: "0", data: [ticker] })
  }
  throw new Error("该来源未配置 WebSocket 行情通道")
}

function requestWebSocketQuote(endpoint: QuoteEndpoint): Promise<BTCState> {
  return new Promise((resolve, reject) => {
    let socket: WebSocket | null = null
    let settled = false
    const timer = setTimeout(() => finish({ error: new Error("WebSocket 连接或行情等待超过 6 秒") }), 6000)

    function finish(result: { state: BTCState } | { error: Error }) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (socket) {
        socket.onopen = undefined
        socket.onmessage = undefined
        socket.onerror = undefined
        socket.onclose = undefined
        try {
          socket.close(1000, "quote request complete")
        } catch (error) {
          console.log("关闭行情连接失败", errorMessage(error))
        }
        socket = null
      }
      if ("error" in result) reject(result.error)
      else resolve(result.state)
    }

    try {
      socket = new WebSocket(endpoint.url)
      socket.onopen = () => {
        try {
          const argument = endpoint.source === "bitget"
            ? { instType: "SPOT", channel: "ticker", instId: "BTCUSDT" }
            : { channel: "tickers", instId: "BTC-USDT" }
          socket?.send(JSON.stringify({ op: "subscribe", args: [argument] }))
        } catch (error) {
          finish({ error: new Error(`发送行情订阅失败：${errorMessage(error)}`) })
        }
      }
      socket.onmessage = message => {
        if (settled) return
        try {
          const event = typeof message === "object" && message != null
            ? message as unknown as { data?: unknown }
            : null
          const text = typeof message === "string" ? message : event?.data
          if (typeof text !== "string") throw new Error("WebSocket 未返回文本行情")
          if (text === "pong") return
          if (text === "ping") {
            socket?.send("pong")
            return
          }
          const state = parseWebSocketQuote(endpoint.source, JSON.parse(text))
          if (state) finish({ state })
        } catch (error) {
          finish({ error: new Error(`WebSocket 行情无效：${errorMessage(error)}`) })
        }
      }
      socket.onerror = error => finish({ error: new Error(`WebSocket 连接失败：${errorMessage(error)}`) })
      socket.onclose = reason => finish({ error: new Error(`行情通道提前关闭${reason ? `：${reason}` : ""}`) })
    } catch (error) {
      finish({ error: new Error(`创建行情连接失败：${errorMessage(error)}`) })
    }
  })
}

async function requestQuote(endpoint: QuoteEndpoint): Promise<BTCState> {
  if (endpoint.transport === "WebSocket") return requestWebSocketQuote(endpoint)
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
      console.log(`请求行情：${endpoint.host} · ${endpoint.transport}`)
      const state = await requestQuote(endpoint)
      return { state, host: endpoint.host, transport: endpoint.transport, failures }
    } catch (error) {
      failures.push(`${endpoint.host} · ${endpoint.transport}：${errorMessage(error)}`)
    }
  }
  const advice = preference === "auto"
    ? "当前网络没有取得可用报价。请检查 Scripting 的蜂窝数据权限，或换 Wi-Fi 再测试。多源不能保证所有国内运营商都能直连。"
    : "该交易所的所有官方通道均未取得有效报价。超时或 TLS 失败可能仍是当前网络的访问问题。请截图各通道结果；不会用其他交易所的价格冒充这个来源，也不会关闭证书校验。"
  throw new QuoteUnavailableError(`${advice}\n\n${failures.join("\n")}`)
}

export async function testConnections(preference: SourcePreference = "auto"): Promise<string[]> {
  const endpoints = ENDPOINTS.filter(endpoint =>
    preference === "auto" || endpoint.source === preference)
  return Promise.all(endpoints.map(async endpoint => {
    const started = Date.now()
    try {
      const state = await requestQuote(endpoint)
      return `✓ ${SOURCE_NAMES[endpoint.source]} · ${endpoint.transport}\n${endpoint.host}\n${state.compactPrice} USDT · ${((Date.now() - started) / 1000).toFixed(1)} 秒`
    } catch (error) {
      return `✗ ${SOURCE_NAMES[endpoint.source]} · ${endpoint.transport}\n${endpoint.host}\n${errorMessage(error)}`
    }
  }))
}
