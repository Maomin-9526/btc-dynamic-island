import {
  LiveActivity,
  LiveActivityUI,
  LiveActivityUIExpandedCenter,
  Text,
  VStack,
} from "scripting"
import type { LiveActivityUIBuilder } from "scripting"

export const ACTIVITY_NAME = "BTCIslandManualV1"

export type BTCState = {
  price: string
  compactPrice: string
  change: string
  time: string
  source?: string
  refreshSeconds?: number
}

function formatMinimalPrice(compactPrice: string) {
  const price = Number(compactPrice)
  return Number.isFinite(price) && price > 0 ? price.toFixed(2) : ""
}

function QuoteView(state: BTCState) {
  return (
    <VStack>
      <Text font="headline">BTC / USDT · {state.source || "OKX"}</Text>
      <Text font={22} bold monospacedDigit>{state.price} USDT</Text>
      <Text foregroundStyle={state.change.startsWith("-") ? "red" : "green"}>
        24h {state.change}
      </Text>
      <Text font="caption">行情时间 {state.time}</Text>
      <Text font="caption">
        {state.refreshSeconds ? `${state.refreshSeconds} 秒刷新间隔 · 以行情时间为准` : "手动刷新"}
      </Text>
    </VStack>
  )
}

const builder: LiveActivityUIBuilder<BTCState> = state => (
  <LiveActivityUI
    content={<QuoteView {...state} />}
    compactLeading={<Text foregroundStyle="orange">₿</Text>}
    compactTrailing={
      <Text font={12} monospacedDigit lineLimit={1} minScaleFactor={0.5}>
        {state.compactPrice}
      </Text>
    }
    minimal={
      <Text font={9} foregroundStyle="orange" monospacedDigit lineLimit={1} minScaleFactor={0.5}>
        {formatMinimalPrice(state.compactPrice)}
      </Text>
    }
  >
    <LiveActivityUIExpandedCenter>
      <QuoteView {...state} />
    </LiveActivityUIExpandedCenter>
  </LiveActivityUI>
)

export const BTCActivity = LiveActivity.register(ACTIVITY_NAME, builder)
