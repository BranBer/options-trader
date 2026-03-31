"use client";

import { useState, useCallback, createContext, useContext } from "react";
import {
  ChevronDown,
  ChevronUp,
  BookOpen,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Lightbulb,
  XCircle,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

// ─── Indicator Explainer Content ───────────────────────────────────────────

export interface IndicatorExplainer {
  name: string;
  shortTip: string;
  color?: string;
  category: "overlay" | "oscillator" | "options-flow";
  summary: string;
  howItWorks: string;
  values: {
    high: { label: string; meaning: string; action: string };
    low: { label: string; meaning: string; action: string };
    neutral?: { label: string; meaning: string };
  };
  bullishSignals: string[];
  bearishSignals: string[];
  entryStrategy: string[];
  exitStrategy: string[];
  commonMistakes: string[];
  combinesWith: string[];
}

export const INDICATOR_EXPLAINERS: Record<string, IndicatorExplainer> = {
  ema9: {
    name: "EMA 9 (Exponential Moving Average)",
    shortTip: "Fast-moving trend line — reacts quickly to price changes.",
    color: "rgb(6,182,212)",
    category: "overlay",
    summary:
      "A 9-period moving average that gives more weight to recent prices, making it highly responsive to short-term price changes. Think of it as a 'smoothed-out' version of the last ~2 weeks of price action.",
    howItWorks:
      "The EMA calculates an average of closing prices but applies a multiplier so that newer prices count more than older ones. A 9-period EMA reacts faster than a 21 or 50-period EMA. When price is above the line, short-term momentum is up. When below, momentum is down. The slope (angle) of the line tells you how strong the momentum is.",
    values: {
      high: {
        label: "Price above EMA 9",
        meaning:
          "Short-term momentum is bullish — buyers are in control on recent bars.",
        action:
          "Look for call entries on pullbacks to the EMA 9 line (it acts as dynamic support in an uptrend).",
      },
      low: {
        label: "Price below EMA 9",
        meaning:
          "Short-term momentum has turned bearish — sellers have taken over recently.",
        action:
          "Avoid new call entries. Look for put entries on bounces up to the EMA 9 (it acts as dynamic resistance in a downtrend).",
      },
    },
    bullishSignals: [
      "Price crosses above EMA 9 on strong volume",
      "Price pulls back to EMA 9 and bounces (support test)",
      "EMA 9 slope turns from flat/down to sharply up",
      'EMA 9 crosses above EMA 21 ("golden cross")',
    ],
    bearishSignals: [
      "Price crosses below EMA 9 on strong volume",
      "Price rallies to EMA 9 and rejects it (resistance test)",
      "EMA 9 slope turns from flat/up to sharply down",
      'EMA 9 crosses below EMA 21 ("death cross")',
    ],
    entryStrategy: [
      "Wait for price to pull back and touch or come close to EMA 9 during an uptrend, then enter calls when it bounces",
      "For weekly options: EMA 9 is your primary timing tool — enter when price is above and the slope is up",
      "Combine with volume: a bounce off EMA 9 on above-average volume is a higher-confidence entry",
    ],
    exitStrategy: [
      "If price closes below EMA 9 on a daily chart, consider closing or reducing call positions",
      "A decisive break below EMA 9 with increasing volume = exit signal",
      "Take partial profits when price extends far above EMA 9 (overextended move)",
    ],
    commonMistakes: [
      "Using EMA 9 alone — it whipsaws in choppy/sideways markets. Always combine with a longer EMA or RSI",
      "Ignoring the slope — a flat EMA 9 means no clear trend; wait for a directional slope before trading",
      "Entering immediately on a cross — wait for confirmation (a close above/below, not just an intraday touch)",
    ],
    combinesWith: ["ema21", "rsi", "volumeMA"],
  },
  ema21: {
    name: "EMA 21 (Exponential Moving Average)",
    shortTip: "Medium-term trend — shows the dominant direction over ~1 month.",
    color: "rgb(249,115,22)",
    category: "overlay",
    summary:
      "A 21-period moving average that represents roughly one month of trading data. It's the go-to trend-following tool for swing traders and is widely respected as dynamic support/resistance.",
    howItWorks:
      "Same calculation as EMA 9 but over 21 periods, so it reacts more slowly and filters out more noise. Institutional traders watch the 21 EMA closely — when price respects it repeatedly, it confirms the trend. The relationship between EMA 9 and EMA 21 tells you whether short-term and medium-term momentum agree.",
    values: {
      high: {
        label: "Price above EMA 21",
        meaning:
          "Medium-term trend is bullish — the stock has been generally rising for weeks.",
        action:
          'Favor call-side trades. Use the EMA 21 as your "line in the sand" for the trend.',
      },
      low: {
        label: "Price below EMA 21",
        meaning:
          "Medium-term trend is bearish — the stock has been generally falling for weeks.",
        action:
          "Favor put-side trades or stay on the sidelines for calls. Be cautious buying the dip against the trend.",
      },
    },
    bullishSignals: [
      "Price holds above EMA 21 on multiple tests — strong uptrend",
      "Price reclaims EMA 21 from below on heavy volume",
      "EMA 9 crosses above EMA 21 (golden cross) — momentum aligning to the upside",
      "Both EMAs are sloping upward and price is above both",
    ],
    bearishSignals: [
      "Price breaks below EMA 21 for the first time in weeks — trend may be reversing",
      "EMA 9 crosses below EMA 21 (death cross) — momentum aligning to the downside",
      "Price rallies to EMA 21 and rejects — now acting as resistance",
      "Both EMAs are sloping downward",
    ],
    entryStrategy: [
      "For swing trade calls (2-4 week expiry): enter when price is above both EMAs and pulls back to EMA 21",
      "The EMA 9/21 golden cross is one of the most reliable entry signals — buy calls on the crossover day or the next dip",
      "Best entries happen when EMA 21 is sloping up AND price bounces off it — this shows institutional buying at that level",
    ],
    exitStrategy: [
      "Close swing trade calls if price closes below EMA 21 on a daily chart — the medium-term trend may be shifting",
      "A death cross (EMA 9 below 21) is a clear signal to exit long options positions",
      "If both EMAs go flat, the trend is pausing — consider taking profits and waiting for direction",
    ],
    commonMistakes: [
      "Fighting the EMA 21 direction — buying calls when price is below a downward-sloping EMA 21 is a low-probability trade",
      "Not waiting for the crossover to complete — a single candle crossing doesn't confirm a trend change",
      "Ignoring timeframes — EMA 21 on a 5-minute chart is different from EMA 21 on a daily chart. For options, use daily or weekly",
    ],
    combinesWith: ["ema9", "bollinger", "macd"],
  },
  bollinger: {
    name: "Bollinger Bands (BB)",
    shortTip: "Volatility envelope — shows when price is overextended.",
    color: "rgb(96,165,250)",
    category: "overlay",
    summary:
      "Three lines on the chart: a 20-period moving average in the middle, with upper and lower bands set 2 standard deviations away. The bands expand and contract with volatility. About 95% of all price action stays inside the bands.",
    howItWorks:
      "When a stock is volatile, the bands widen. When it's calm, they squeeze together. This is critical for options traders because band width directly relates to implied volatility (and options pricing). A touch of the upper band means price is at the top of its recent range; a touch of the lower band means it's at the bottom.",
    values: {
      high: {
        label: "Price at/above upper band",
        meaning:
          "The stock is trading at the top of its recent range — it's statistically \"overextended\" to the upside. This doesn't guarantee a reversal, but the odds of a pullback are elevated.",
        action:
          'Be cautious buying calls here. Consider taking profits on existing calls. If the trend is strong, price can "walk the band" — but if volume fades, expect a pullback to the middle band.',
      },
      low: {
        label: "Price at/below lower band",
        meaning:
          'The stock is trading at the bottom of its recent range — it\'s statistically "oversold" relative to recent volatility.',
        action:
          "Consider buying calls for a mean-reversion bounce back to the middle band. Selling puts at or below the lower band can be profitable if you're bullish on the stock.",
      },
      neutral: {
        label: "Band squeeze (bands very narrow)",
        meaning:
          "Volatility has compressed — a big move is likely coming, but direction is unknown. This is like a coiled spring.",
      },
    },
    bullishSignals: [
      "Price bounces off the lower band with increasing volume — mean reversion trade",
      "Bands are squeezing and price breaks above the upper band — breakout signal",
      "Price returns to the middle band (20 SMA) and holds it as support",
      "Band width expanding after a squeeze with price above the middle — bullish breakout confirmed",
    ],
    bearishSignals: [
      "Price rejects at the upper band with declining volume",
      "Price breaks below the lower band after a period of declining price — momentum breakdown",
      "Price fails to reclaim the middle band after falling below it",
      "Bands expanding with price below the middle — bearish trend accelerating",
    ],
    entryStrategy: [
      "Mean reversion: buy calls when price touches the lower band in an overall uptrend (target: middle band for profit)",
      "Squeeze breakout: when bands are at their narrowest in weeks, buy a straddle or strangle — you're betting on a big move in either direction when volatility is cheap",
      "Band walk: if price keeps touching the upper band with band width expanding, ride the trend with calls — but use a tight stop below the middle band",
    ],
    exitStrategy: [
      "Take profits on mean-reversion calls when price reaches the middle band",
      "Exit calls if price closes below the middle band (20 SMA) — the mean reversion went the wrong way",
      "On squeeze breakout straddles: take profits when band width has expanded significantly (volatility spike achieved)",
    ],
    commonMistakes: [
      'Assuming every upper band touch means "sell" — in strong trends, price walks along the upper band for weeks',
      "Ignoring the squeeze setup — the squeeze is the most important Bollinger Band signal for options traders because it tells you when volatility (and therefore premiums) are cheap",
      "Trading Bollinger Bands alone on low-volume stocks — they work best on liquid names with regular volume",
    ],
    combinesWith: ["rsi", "volumeMA", "ema21"],
  },
  volumeMA: {
    name: "Volume Moving Average",
    shortTip:
      "20-period average volume — shows if activity is above or below normal.",
    color: "rgba(255,255,255,0.6)",
    category: "overlay",
    summary:
      'A line on the volume bars showing the average trading volume over the last 20 periods. Volume is the "fuel" behind price moves — high volume validates a move, low volume warns that a move may not be sustainable.',
    howItWorks:
      "Each volume bar represents how many shares traded that period. The Volume MA smooths this into a baseline. When a bar is above the line, more people are trading than usual. When below, participation is light. The key insight: price moves on high volume tend to continue; price moves on low volume tend to reverse.",
    values: {
      high: {
        label: "Volume above average (bar above the MA line)",
        meaning:
          "Stronger-than-normal participation — institutions and large traders are active. The current price move has conviction behind it.",
        action:
          "Trust the price direction more. A breakout on 2x+ average volume is a high-confidence signal. This is also when options prices spike (higher implied volatility).",
      },
      low: {
        label: "Volume below average (bar below the MA line)",
        meaning:
          "Weak participation — the move may be driven by small/retail traders. It's more likely to reverse or fizzle out.",
        action:
          "Be skeptical of breakouts on low volume — they often fail. Wait for a high-volume day to confirm the move before entering options positions.",
      },
    },
    bullishSignals: [
      "Price breakout above resistance on 2x+ average volume — institutions are buying",
      "Increasing volume on up-days, decreasing volume on down-days (accumulation pattern)",
      "Volume spike on a bounce off support — big money defending the level",
      "Volume MA trending up over several weeks while price trends up — healthy uptrend",
    ],
    bearishSignals: [
      "Rally to new highs on declining volume — the uptrend is running out of steam",
      "Volume spike on a breakdown below support — institutional selling",
      "Increasing volume on down-days, decreasing volume on up-days (distribution pattern)",
      "Price near all-time highs but volume MA is declining — buyers are done",
    ],
    entryStrategy: [
      "Only enter options positions when volume confirms the move — breakout + high volume = enter; breakout + low volume = wait",
      "Look for volume spikes at key support/resistance levels — they signal institutional decisions",
      "The best call entries come on high-volume bounces off support; put entries on high-volume breakdowns below support",
    ],
    exitStrategy: [
      "If your trade thesis required a breakout and volume dries up, exit — the move is running out of fuel",
      "Take profits when you see a volume climax (an abnormally huge volume spike) — this often marks a short-term top or bottom",
      "If volume picks up against your position (e.g., heavy selling volume while you're holding calls), exit quickly",
    ],
    commonMistakes: [
      "Ignoring volume entirely — it's the single most overlooked confirmation tool. Many false breakouts could be avoided by checking volume",
      "Comparing volume across different stocks — each stock has its own \"normal\" volume. That's why the MA is important: it's relative to that stock",
      "Confusing a volume spike with a trend — one big volume day doesn't mean the trend will continue. Look for a pattern of above-average volume days",
    ],
    combinesWith: ["ema9", "ema21", "bollinger"],
  },
  rsi: {
    name: "RSI (Relative Strength Index)",
    shortTip: "Scale of 0-100 showing if a stock is overbought or oversold.",
    color: "rgb(147,51,234)",
    category: "oscillator",
    summary:
      'A momentum oscillator that measures the speed and size of recent price changes on a scale from 0 to 100. It answers the question: "How strong is the current move compared to recent moves?" Readings above 70 suggest overbought conditions; below 30 suggest oversold.',
    howItWorks:
      "RSI compares the average size of up-closes vs. down-closes over 14 periods. If a stock has been going up almost every day, RSI will be high. If it's been falling most days, RSI will be low. It's plotted in its own panel below the chart with horizontal lines at 30 and 70. The key power of RSI is detecting \"divergence\" — when price and RSI disagree, a reversal is often coming.",
    values: {
      high: {
        label: "RSI above 70 (Overbought)",
        meaning:
          'The stock has had an unusually strong rally and may be "due" for a pause or pullback. Buyers have pushed price up aggressively and some profit-taking is likely.',
        action:
          "Don't buy new calls here — you're late to the move. Consider taking profits on existing calls. Advanced: sell call credit spreads to profit from an expected pullback or stall. RSI above 80 is extremely overbought.",
      },
      low: {
        label: "RSI below 30 (Oversold)",
        meaning:
          'The stock has sold off heavily and may be "due" for a bounce. Sellers are exhausted and some bargain-hunting buying is likely.',
        action:
          "This is one of the best times to consider buying calls — you're buying after a selloff. Look for RSI curling back above 30 as your entry signal (don't buy while it's still falling). RSI below 20 is extremely oversold.",
      },
      neutral: {
        label: "RSI between 40-60",
        meaning:
          "No strong overbought or oversold signal — the stock is in a neutral momentum zone. Look at other indicators for direction.",
      },
    },
    bullishSignals: [
      "RSI drops below 30, then crosses back above 30 — oversold bounce signal",
      "Bullish divergence: price makes a lower low but RSI makes a higher low — selling pressure is weakening, reversal likely",
      "RSI breaks above 50 from below — momentum shifting from bearish to bullish",
      "RSI holds above 40 during a pullback in an uptrend — healthy pullback, buyers still in control",
    ],
    bearishSignals: [
      "RSI rises above 70, then crosses back below 70 — overbought reversal signal",
      "Bearish divergence: price makes a higher high but RSI makes a lower high — the rally is losing steam, potential top",
      "RSI breaks below 50 from above — momentum shifting from bullish to bearish",
      "RSI can't get above 60 during a bounce in a downtrend — weak bounce, sellers still in control",
    ],
    entryStrategy: [
      "Oversold bounce: when RSI drops below 30 and then crosses back above 30, buy calls with 3-4 week expiration aimed at a bounce to RSI 50-60 territory",
      "Bullish divergence: this is one of the highest-probability setups in options trading. When you see it, buy calls — the reversal can be powerful. Use 4-6 week expirations to give the trade time",
      "Trend confirmation: in an uptrend, wait for RSI to pull back to 40-50 before adding calls — you're buying the dip with momentum confirmation",
    ],
    exitStrategy: [
      "Take profits on calls when RSI hits 70 — the easy part of the move is over",
      "If you see bearish divergence (price makes new high but RSI doesn't), start reducing your position — a reversal is likely",
      "Exit puts when RSI reaches 30 — the selloff is maturing and a bounce is probable",
    ],
    commonMistakes: [
      "Buying calls just because RSI hit 30 — RSI can stay oversold for weeks in a strong downtrend. Wait for RSI to curl back above 30 before entering",
      "Shorting (buying puts) just because RSI hit 70 — in strong uptrends, RSI can ride above 70 for extended periods. Look for bearish divergence first",
      "Ignoring divergence — this is the most powerful RSI signal but most beginners only look at the 30/70 levels",
      "Using RSI on very short timeframes for options — RSI on a 1-minute chart is too noisy. Use daily RSI for options trades with weekly+ expirations",
    ],
    combinesWith: ["ema9", "bollinger", "macd"],
  },
  macd: {
    name: "MACD (Moving Average Convergence Divergence)",
    shortTip:
      "Tracks trend direction and momentum strength using the gap between two EMAs.",
    color: "rgb(59,130,246)",
    category: "oscillator",
    summary:
      "MACD shows the relationship between two exponential moving averages (12-period and 26-period). It plots three things: the MACD line (the gap between the two EMAs), the signal line (a 9-period EMA of the MACD line), and a histogram (the difference between MACD and signal). It tells you both the direction and the strength of momentum.",
    howItWorks:
      "When the faster EMA (12) is above the slower EMA (26), the MACD line is positive — upward momentum. When below, the MACD line is negative — downward momentum. The signal line smooths this out. The histogram bars visually show whether momentum is growing or shrinking. Tall green bars = strong bullish momentum. Tall red bars = strong bearish momentum. Shrinking bars = momentum is fading.",
    values: {
      high: {
        label: "Large positive MACD / tall green histogram bars",
        meaning:
          "Strong bullish momentum — the fast EMA is well above the slow EMA. The uptrend has significant force behind it. However, extremely large values can also mean the move is overextended.",
        action:
          "If you're already in calls, ride the trend but watch for histogram bars starting to shrink. Growing bars = add or hold. Shrinking bars = start tightening your stop or taking partial profits.",
      },
      low: {
        label: "Large negative MACD / tall red histogram bars",
        meaning:
          "Strong bearish momentum — the fast EMA is well below the slow EMA. Puts are working well. Selling pressure is intense.",
        action:
          "If you're in puts, ride the trend. If you're waiting to buy calls, don't — the selling isn't done yet. Wait for the histogram bars to start shrinking (momentum fading) before looking for a bottom.",
      },
      neutral: {
        label: "MACD near zero / small histogram bars",
        meaning:
          "The two EMAs are close together — the stock is either in a range or at a potential turning point. A crossover in either direction could signal the next big move.",
      },
    },
    bullishSignals: [
      "MACD line crosses above the signal line (bullish crossover) — the most popular MACD buy signal",
      "Histogram turns from red to green (negative to positive) — momentum shifting from bearish to bullish",
      "Histogram bars are green and getting taller — bullish momentum is accelerating",
      "Bullish divergence: price makes a lower low but MACD makes a higher low — the downtrend is losing power",
      "MACD line crosses above zero (the zero line) — trend has turned from bearish to bullish overall",
    ],
    bearishSignals: [
      "MACD line crosses below the signal line (bearish crossover) — sell signal",
      "Histogram turns from green to red — momentum shifting from bullish to bearish",
      "Histogram bars are red and getting taller — bearish momentum is accelerating",
      "Bearish divergence: price makes a higher high but MACD makes a lower high — the uptrend is weakening",
      "MACD line crosses below zero — trend has turned from bullish to bearish overall",
    ],
    entryStrategy: [
      "Bullish crossover entry: when the MACD line crosses above the signal line AND the histogram turns green, enter calls. Best with 2-4 week expiration for swing trades",
      "Zero-line cross: when MACD crosses from negative to positive territory, it confirms a trend change — this is a higher-confidence but slower entry than the signal crossover",
      "Divergence entry: bullish MACD divergence + RSI below 40 is an extremely powerful combo for buying calls. This setup catches reversal bottoms",
      "Histogram momentum: enter calls when histogram bars flip from red to green, size up when bars are green and growing",
    ],
    exitStrategy: [
      "When the histogram bars start shrinking after being tall green — momentum is fading, take partial profits",
      "When a bearish crossover occurs (MACD crosses below signal) — close remaining call positions",
      "If you're in puts, exit when histogram bars start shrinking after being tall red",
      "Take profits before the histogram gets to extreme readings — the biggest bars often mark the climax of a move",
    ],
    commonMistakes: [
      "Trading every single crossover — MACD gives many false signals in choppy/sideways markets. Only trade crossovers that occur while the overall trend (EMA 21) agrees with the direction",
      "Ignoring the histogram — most beginners only watch for line crossovers, but the histogram is actually more useful for timing. Shrinking bars warn you early that momentum is dying",
      "Using MACD for very short-term trades — MACD is a lagging indicator. It works best for 2-6 week swing trades on daily charts. For day trading or weekly options, use RSI instead",
      "Not confirming with volume — a MACD crossover on low volume is unreliable. Always check that volume confirms the signal",
    ],
    combinesWith: ["rsi", "ema21", "volumeMA"],
  },
  maxPain: {
    name: "Max Pain",
    shortTip:
      "Strike price where the most options expire worthless — price tends to gravitate here.",
    category: "options-flow",
    summary:
      "Max Pain is the strike price at which the greatest number of options contracts (both calls and puts combined) would expire worthless. Since market makers and dealers are typically net sellers of options, they may hedge in ways that naturally push the stock toward this price as expiration approaches.",
    howItWorks:
      'At any given time, there are thousands of open option contracts across many strike prices. Max Pain calculates: "At which price would the most options lose their value?" This is displayed as an amber dashed line on the chart. The theory is that the large institutions which sold those options will delta-hedge in ways that create a "gravitational pull" toward Max Pain — especially in the final 3-5 days before options expiration.',
    values: {
      high: {
        label: "Current price well above Max Pain",
        meaning:
          "Many more call options are in-the-money than put options. There's a gravitational pull downward toward Max Pain — especially as expiration week approaches.",
        action:
          "Be cautious buying calls that expire this week — there's headwind. Consider selling call credit spreads instead, or buy calls with expirations beyond this weekly cycle. Puts expiring this week may benefit from the gravitational pull.",
      },
      low: {
        label: "Current price well below Max Pain",
        meaning:
          "Many more put options are in-the-money. There's a gravitational pull upward toward Max Pain.",
        action:
          'Consider buying calls with this-week expiry for a bounce toward Max Pain. Be cautious on put positions that rely on further downside this week — the stock may get "pinned" near Max Pain.',
      },
    },
    bullishSignals: [
      "Price is below Max Pain early in expiration week — expect upward drift",
      "Max Pain is trending higher week over week — bullish options positioning",
      "Price sitting right at Max Pain with low volume — likely to stay pinned (good for selling premium)",
    ],
    bearishSignals: [
      "Price is above Max Pain early in expiration week — expect downward drift",
      "Max Pain is trending lower week over week — bearish options positioning",
      "Price broke far below Max Pain — the gravitational effect has been overwhelmed by strong selling",
    ],
    entryStrategy: [
      "Use Max Pain as a guide for expiration-week trades: if price is below Max Pain, lean bullish for the week. If above, lean bearish",
      "Don't buy options with strikes far from Max Pain for the current expiration — the deck is stacked against you",
      "Best use: sell premium (iron condors, credit spreads) with the short strike near Max Pain — it's the most probable pin point",
    ],
    exitStrategy: [
      "Take profits on expiration-week trades as price approaches Max Pain — don't expect it to blow past it",
      "If price reaches Max Pain by Wednesday, close your positions — the remaining movement will be minimal",
      "Exit positions that rely on Max Pain theory if price moves >5% past it on heavy volume — the gravitational effect has been broken",
    ],
    commonMistakes: [
      "Relying on Max Pain after it's been far exceeded — when institutional buying or selling overwhelms dealer hedging, Max Pain stops mattering",
      "Using Max Pain for non-expiration weeks — the effect is strongest in the final 3-5 days before expiration, especially on monthly option expiry (OPEX)",
      "Treating Max Pain as guaranteed — it's a statistical tendency, not a certainty. Use it as one data point alongside other indicators",
    ],
    combinesWith: ["oiWalls", "gexFlip"],
  },
  oiWalls: {
    name: "Open Interest (OI) Walls",
    shortTip:
      "Strike prices with massive option positions creating support/resistance.",
    category: "options-flow",
    summary:
      "OI Walls are strike prices where an unusually large number of options contracts are open. Call walls create resistance (overhead selling pressure from dealer hedging) and put walls create support (buying pressure from dealer hedging). They are displayed as dashed lines on the chart — red for call walls, green for put walls.",
    howItWorks:
      'When a market maker sells a call option at strike $150, they need to buy shares to hedge their exposure as price approaches $150. This buying slows down as they get fully hedged, and they start selling as price moves above $150. The result: large call OI at a strike creates a "ceiling." The reverse happens with put OI — dealers sell shares as price drops toward the put strike, then buy as it goes below. This creates a "floor." The bigger the OI, the stronger the wall.',
    values: {
      high: {
        label: "Large call OI wall above current price",
        meaning:
          "There's significant resistance overhead. Dealer hedging flows will create selling pressure as price approaches this strike. The stock will have to work hard to get through it.",
        action:
          'Set call profit targets at or slightly below the call wall — don\'t expect price to blow through it easily. Consider selling call spreads at the wall strike. If price does break above on huge volume, it can trigger a "gamma squeeze" that accelerates the move.',
      },
      low: {
        label: "Large put OI wall below current price",
        meaning:
          "There's significant support below. Dealer hedging flows will create buying pressure as price approaches this strike.",
        action:
          "Sell puts at or near the put wall strike — the support makes it less likely to be breached. Use put walls as stop-loss reference points for call positions — if the put wall breaks, your thesis may be wrong.",
      },
    },
    bullishSignals: [
      "Stock is sitting on a large put OI wall (strong support) — dealers are buying to hedge",
      "Call OI wall above was breached on heavy volume — potential gamma squeeze higher",
      "Put walls are stacking up (increasing OI at strikes below price) — options market is positioning bullishly",
    ],
    bearishSignals: [
      "Stock is pressing against a large call OI wall and failing — dealers are selling to hedge",
      "Put OI wall below was breached on heavy volume — support is lost, potential cascade lower",
      "Call walls are stacking up (increasing OI at strikes above price) — options market expects limited upside",
    ],
    entryStrategy: [
      "Buy calls when price is near a put OI wall — you have built-in support beneath you",
      "Sell put credit spreads at or below the put wall — high probability of staying above that strike",
      "Iron condors between a call wall above and put wall below — price is likely to stay in this range",
      "If a call wall is breached on 2x+ average volume, buy calls immediately for a gamma squeeze ride",
    ],
    exitStrategy: [
      "Take call profits as price approaches a call OI wall — don't try to squeeze out the last dollar",
      "Close put positions if the put wall breaks on volume — support is gone",
      "On iron condors: close early if price approaches either wall with momentum, don't wait for expiration",
    ],
    commonMistakes: [
      "Assuming OI walls are permanent — open interest changes daily as traders open and close positions. Check updated data regularly",
      "Ignoring volume at the wall — a low-volume approach to a wall will be stopped. A high-volume approach may break through",
      "Not understanding gamma squeeze mechanics — when a call wall breaks, the hedging unwind can cause explosive upside. This is how meme stocks rally 50% in a day",
    ],
    combinesWith: ["maxPain", "gexFlip", "volumeMA"],
  },
  gexFlip: {
    name: "GEX Flip Level (Gamma Exposure)",
    shortTip:
      "Price level where dealer hedging switches from stabilizing to amplifying moves.",
    category: "options-flow",
    summary:
      "The GEX (Gamma Exposure) Flip level is the price where the net gamma exposure of market makers changes from positive to negative. Above this level, dealers act as a stabilizing force (dampening moves). Below it, they become a destabilizing force (amplifying moves). It's shown as a purple dotted line on the chart.",
    howItWorks:
      'Market makers who sell options must delta-hedge by buying or selling shares. Their "gamma" determines how much they need to adjust. Positive gamma = they buy dips and sell rips (stabilizing). Negative gamma = they sell dips and buy rips (amplifying). The GEX Flip level is where this switches. Think of it as the market\'s "chaos threshold" — above it, orderly trading. Below it, wilder swings.',
    values: {
      high: {
        label: "Price above GEX Flip (positive gamma / long gamma zone)",
        meaning:
          'Dealer hedging dampens price movements. Expect choppier, tighter ranges and lower realized volatility. The market is in a "stable" regime.',
        action:
          "This environment favors selling premium — credit spreads, iron condors, and covered calls work well because moves are contained. Don't overpay for long options — volatility may shrink.",
      },
      low: {
        label: "Price below GEX Flip (negative gamma / short gamma zone)",
        meaning:
          'Dealer hedging amplifies price movements. Expect bigger swings, trending moves, and higher realized volatility. The market is in a "volatile" regime.',
        action:
          "This environment favors buying options — long calls, puts, straddles, and debit spreads benefit from the amplified moves. Avoid selling premium — a sudden large move can blow up a short position.",
      },
    },
    bullishSignals: [
      "Price crossing above the GEX flip from below — volatility may compress, stabilizing the uptrend",
      "Price well above GEX flip with low realized vol — calm, grind-higher environment (calls do well with less theta burn risk)",
      "GEX flip level rising over time — dealers shifting their hedging to protect higher prices",
    ],
    bearishSignals: [
      "Price crossing below the GEX flip from above — volatility about to expand, moves get amplified",
      "Price well below GEX flip — dealers are amplifying the selloff by selling into it. Cascading moves likely",
      "GEX flip level falling over time — dealers adjusting to lower price expectations",
    ],
    entryStrategy: [
      "Above GEX flip: sell credit spreads and iron condors — the dampened environment makes mean reversion reliable",
      "Below GEX flip: buy directional options (calls or puts based on trend) — the amplified moves produce bigger profits on long options",
      "Right at the GEX flip: buy a straddle — you're betting on a big move when the level is tested, but direction is unclear",
      "Combine with OI walls: if price is below GEX flip AND approaching a put wall, it's a high-conviction call entry — dealers will amplify any bounce off that support",
    ],
    exitStrategy: [
      "If you're selling premium and price drops below GEX flip, consider closing early — the volatility expansion can quickly move against you",
      "If you're long options above GEX flip, profits may be smaller because moves are dampened — set realistic targets",
      "Below GEX flip, moves are bigger and faster — take profits quicker because reversals are also amplified",
    ],
    commonMistakes: [
      "Selling options (credit spreads, naked puts) in a negative gamma environment — this is how accounts blow up. Below GEX flip, moves are amplified and can be extreme",
      "Buying options (long straddles) in a positive gamma environment — the dampened moves eat away at your premium through theta decay",
      "Ignoring GEX entirely — it's one of the most important structural factors in the options market, but many retail traders don't even know it exists",
      "Not combining GEX with direction — GEX tells you the volatility regime, not the direction. You still need a directional indicator (like EMA or RSI) to pick calls vs. puts",
    ],
    combinesWith: ["oiWalls", "maxPain", "rsi"],
  },
};

// ─── Modal context for opening indicator modals from anywhere ──────────────

const IndicatorModalContext = createContext<{
  openModal: (key: string) => void;
}>({ openModal: () => {} });

export function IndicatorModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const openModal = useCallback((key: string) => setActiveKey(key), []);
  const explainer = activeKey ? INDICATOR_EXPLAINERS[activeKey] : null;

  return (
    <IndicatorModalContext.Provider value={{ openModal }}>
      {children}
      <Sheet
        open={!!activeKey}
        onOpenChange={(open) => !open && setActiveKey(null)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg p-0 flex flex-col"
        >
          {explainer && (
            <>
              <SheetHeader className="p-4 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  {explainer.color && (
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: explainer.color }}
                    />
                  )}
                  <SheetTitle className="text-base">
                    {explainer.name}
                  </SheetTitle>
                </div>
                <SheetDescription className="text-sm">
                  {explainer.summary}
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="flex-1 overflow-y-auto">
                <IndicatorModalBody
                  explainer={explainer}
                  indicatorKey={activeKey!}
                />
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </IndicatorModalContext.Provider>
  );
}

function useIndicatorModal() {
  return useContext(IndicatorModalContext);
}

// ─── Modal body ────────────────────────────────────────────────────────────

function IndicatorModalBody({
  explainer,
  indicatorKey,
}: {
  explainer: IndicatorExplainer;
  indicatorKey: string;
}) {
  return (
    <div className="p-4 pt-0 space-y-5 pb-8">
      {/* How it works */}
      <Section title="How It Works">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {explainer.howItWorks}
        </p>
      </Section>

      <Separator />

      {/* What values mean */}
      <Section title="Reading the Values">
        <div className="space-y-3">
          <ValueCard
            icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
            label={explainer.values.high.label}
            meaning={explainer.values.high.meaning}
            action={explainer.values.high.action}
            accentClass="border-emerald-500/30 bg-emerald-500/5"
          />
          <ValueCard
            icon={<TrendingDown className="h-4 w-4 text-red-400" />}
            label={explainer.values.low.label}
            meaning={explainer.values.low.meaning}
            action={explainer.values.low.action}
            accentClass="border-red-500/30 bg-red-500/5"
          />
          {explainer.values.neutral && (
            <ValueCard
              icon={<Target className="h-4 w-4 text-blue-400" />}
              label={explainer.values.neutral.label}
              meaning={explainer.values.neutral.meaning}
              accentClass="border-blue-500/30 bg-blue-500/5"
            />
          )}
        </div>
      </Section>

      <Separator />

      {/* Signals */}
      <Section title="Patterns to Watch">
        <div className="grid gap-3 sm:grid-cols-2">
          <SignalList
            title="Bullish Signals"
            items={explainer.bullishSignals}
            icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-400" />}
            badgeClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
          />
          <SignalList
            title="Bearish Signals"
            items={explainer.bearishSignals}
            icon={<TrendingDown className="h-3.5 w-3.5 text-red-400" />}
            badgeClass="bg-red-500/10 text-red-400 border-red-500/30"
          />
        </div>
      </Section>

      <Separator />

      {/* Entry & exit */}
      <Section title="Using This for Options Trades">
        <div className="space-y-3">
          <TipList
            title="Entry Strategy"
            items={explainer.entryStrategy}
            icon={<Target className="h-3.5 w-3.5 text-cyan-400" />}
            accentClass="bg-cyan-500/5 border-cyan-500/20"
          />
          <TipList
            title="Exit Strategy"
            items={explainer.exitStrategy}
            icon={<Lightbulb className="h-3.5 w-3.5 text-amber-400" />}
            accentClass="bg-amber-500/5 border-amber-500/20"
          />
        </div>
      </Section>

      <Separator />

      {/* Common mistakes */}
      <Section title="Common Mistakes to Avoid">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
          {explainer.commonMistakes.map((m, i) => (
            <div key={i} className="flex gap-2 text-sm leading-relaxed">
              <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{m}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Combines with */}
      {explainer.combinesWith.length > 0 && (
        <>
          <Separator />
          <Section title="Best Combined With">
            <div className="flex flex-wrap gap-1.5">
              {explainer.combinesWith.map((key) => {
                const partner = INDICATOR_EXPLAINERS[key];
                if (!partner) return null;
                return (
                  <CombinesWithBadge
                    key={key}
                    indicatorKey={key}
                    partner={partner}
                  />
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function CombinesWithBadge({
  indicatorKey,
  partner,
}: {
  indicatorKey: string;
  partner: IndicatorExplainer;
}) {
  const { openModal } = useIndicatorModal();
  return (
    <button
      onClick={() => openModal(indicatorKey)}
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent transition-colors"
    >
      {partner.color && (
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: partner.color }}
        />
      )}
      {partner.name.split(" (")[0]}
    </button>
  );
}

// ─── Layout helpers ────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function ValueCard({
  icon,
  label,
  meaning,
  action,
  accentClass,
}: {
  icon: React.ReactNode;
  label: string;
  meaning: string;
  action?: string;
  accentClass: string;
}) {
  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${accentClass}`}>
      <div className="flex items-center gap-2 font-medium text-sm">
        {icon}
        {label}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{meaning}</p>
      {action && (
        <div className="flex gap-1.5 pt-1">
          <Target className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-foreground/80 leading-relaxed">{action}</p>
        </div>
      )}
    </div>
  );
}

function SignalList({
  title,
  items,
  icon,
  badgeClass,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  badgeClass: string;
}) {
  return (
    <div className="space-y-2">
      <Badge variant="outline" className={`text-xs ${badgeClass}`}>
        <span className="flex items-center gap-1">
          {icon} {title}
        </span>
      </Badge>
      <ul className="space-y-1.5 pl-1">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex gap-2 text-xs text-muted-foreground leading-relaxed"
          >
            <span className="text-muted-foreground/50 shrink-0 mt-px">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TipList({
  title,
  items,
  icon,
  accentClass,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  accentClass: string;
}) {
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${accentClass}`}>
      <div className="flex items-center gap-1.5 font-medium text-xs">
        {icon}
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex gap-2 text-xs text-muted-foreground leading-relaxed"
          >
            <span className="text-primary/60 shrink-0 font-mono text-[10px] mt-px">
              {i + 1}.
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── InfoTooltip — "?" icon that opens the indicator modal ─────────────────

export function InfoTooltip({
  text,
  indicatorKey,
  className,
}: {
  text: string;
  indicatorKey?: string;
  className?: string;
}) {
  const { openModal } = useIndicatorModal();

  if (indicatorKey && INDICATOR_EXPLAINERS[indicatorKey]) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openModal(indicatorKey);
        }}
        className={`inline-flex items-center text-muted-foreground/60 hover:text-primary transition-colors ${className ?? ""}`}
        aria-label={`Learn about ${INDICATOR_EXPLAINERS[indicatorKey].name}`}
        title="Click to learn more"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
    );
  }

  // Fallback: simple tooltip for non-indicator usage
  return (
    <span
      className={`inline-flex items-center text-muted-foreground/60 cursor-help ${className ?? ""}`}
      title={text}
      aria-label={text}
    >
      <HelpCircle className="h-3 w-3" />
    </span>
  );
}

// ─── IndicatorGuide — card for the TA Guide tab ───────────────────────────

interface IndicatorGuideProps {
  indicatorKey: string;
  compact?: boolean;
}

export function IndicatorGuide({
  indicatorKey,
  compact = false,
}: IndicatorGuideProps) {
  const { openModal } = useIndicatorModal();
  const explainer = INDICATOR_EXPLAINERS[indicatorKey];
  if (!explainer) return null;

  if (compact) {
    return (
      <button
        onClick={() => openModal(indicatorKey)}
        className="w-full text-left text-xs flex items-center gap-1.5 py-1 text-muted-foreground hover:text-foreground transition-colors group"
      >
        {explainer.color && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: explainer.color }}
          />
        )}
        <span className="font-medium group-hover:underline">
          {explainer.name}
        </span>
        <HelpCircle className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
      </button>
    );
  }

  return (
    <button
      onClick={() => openModal(indicatorKey)}
      className="w-full text-left rounded-md border p-3 space-y-1.5 hover:border-primary/40 hover:bg-accent/30 transition-colors group"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {explainer.color && (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: explainer.color }}
          />
        )}
        {explainer.name}
        <HelpCircle className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
      </span>
      <p className="text-xs text-muted-foreground">{explainer.shortTip}</p>
      <span className="text-[10px] text-primary/60 font-medium">
        Click to learn more →
      </span>
    </button>
  );
}

// ─── IndicatorGuidePanel — collapsible list below charts ──────────────────

interface IndicatorGuidePanelProps {
  activeIndicators?: string[];
  showOptionsContext?: boolean;
}

export function IndicatorGuidePanel({
  activeIndicators = [],
  showOptionsContext = false,
}: IndicatorGuidePanelProps) {
  const [open, setOpen] = useState(false);

  const indicatorKeys = [
    ...activeIndicators,
    ...(showOptionsContext ? ["maxPain", "oiWalls", "gexFlip"] : []),
  ];

  if (indicatorKeys.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span className="font-medium">
          {open ? "Hide" : "Learn about"} these indicators
        </span>
        {open ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>
      {open && (
        <div className="space-y-0.5 border rounded-md p-2">
          {indicatorKeys.map((key) => (
            <IndicatorGuide key={key} indicatorKey={key} compact />
          ))}
        </div>
      )}
    </div>
  );
}
