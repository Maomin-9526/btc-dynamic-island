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
}

function QuoteView(state: BTCState) {
  return (
    <VStack>
      <Text font="headline">BTC / USDT · OKX</Text>
      <Text font={22} bold monospacedDigit>{state.price} USDT</Text>
      <Text foregroundStyle={state.change.startsWith("-") ? "red" : "green"}>
        24h {state.change}
      </Text>
      <Text font="caption">行情时间 {state.time} · 手动刷新</Text>
    </VStack>
  )
}

const builder: LiveActivityUIBuilder<BTCState> = state => (
  <LiveActivityUI
    content={<QuoteView {...state} />}
    compactLeading={<Text foregroundStyle="orange">₿</Text>}
    compactTrailing={
      <Text font={13} monospacedDigit lineLimit={1} minScaleFactor={0.6}>
        {state.compactPrice}
      </Text>
    }
    minimal={<Text foregroundStyle="orange">₿</Text>}
  >
    <LiveActivityUIExpandedCenter>
      <QuoteView {...state} />
    </LiveActivityUIExpandedCenter>
  </LiveActivityUI>
)

export const BTCActivity = LiveActivity.register(ACTIVITY_NAME, builder)
