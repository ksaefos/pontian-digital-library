# OpenPageFlip / pagination coordination

Baseline: `e0fecf335b154e08f66c4c63b520ba3b721bdc52` (public main at implementation start). Scope is item 5 only. OpenPageFlip 0.7.0, the 24-page window, typography, progressive batches, Hyphenopoly, source anchors and fallback remain in place. No canonical data, Studio or Worker changes.

## Contract

`reader/scripts/reader-coordinator.js` owns a single timer and four ordered slots:

1. Latest layout request, including a return to the current layout.
2. Pagination / full relayout. A requested full relayout retains its render and search work when merged with a direct pagination call.
3. Latest page-window build. Repeated soft notifications retain the earliest outstanding build deadline to avoid starvation.
4. Pending animated turn. The adapter still rejects an intention whose chapter/page has been superseded, and still retries a rejected animation only once.

A delayed pagination slot blocks a build even if the build's own deadline has passed. All tasks check the same gesture/animation gate. The adapter wakes it on pointer release, engine `read`, and programmatic animation settlement. Engine state wakeups run in a microtask after the engine finishes emitting its events. The existing 450 ms post-pointer protection and 4 s lost-pointer escape remain; a 1 s animation watchdog covers a missed wakeup without forcibly cancelling an active turn. Idle direct APIs still execute synchronously.

`pdlScheduleRelayout` delegates to the coordinator after adapter startup, including calls from already registered resize/font observers. Its original debounce remains available during early startup. Measurement, native render, layout-ready notification and search reindexing now run as one deferred relayout transaction. The old arrangement deferred only `pdlPaginate` and could run the other operations against an old page mapping during a flip.

Engine ownership stays in `openpageflip-adapter.js`. The scheduler does not manipulate DOM, paginate text or manage source offsets. Window-signature reuse and `turnTo` now pass through the same gate; programmatic synchronization cannot snap an unchanged mounted window under a held pointer. Existing debug fields remain, with an added `coordinator` snapshot: pending slots, waiting reason, request/coalescing/execution counts and timer callbacks. Counters retain no content or unbounded event history.

After deferred window reuse, the adapter reapplies active search highlighting at the visible page geometry, as it already does after a fresh build. This also reschedules mobile search placement. The unchanged mobile overlap regression detected that moving `turnTo` behind the gate otherwise left placement based on the previously hidden leaf.

## Measurement

Fixture: real published **Η Σωνίτσα**, desktop 1366×900, single-page layout, Chromium 140.0.7339.186, headless Playwright 1.55.1, local `dist/`, service workers blocked, no CPU/network throttling. Start at chapter 0 page 3, start an actual animated turn, issue 20 sets of layout/pagination/layout-ready/window-extension requests and a final double-layout request (81 requests). Compare the baseline and new artifact using the same fixture.

| Observed count in one run | Baseline | Coordinator |
| --- | ---: | ---: |
| Legacy 75/130 ms polling timer callbacks | 21 | 0 |
| Engine builds | 2 | 2 |
| Interrupted turns | 0 | 0 |
| Genuine animated turns | 1 | 1 |

The new run coalesced 83 requests including follow-up notifications. Its coordinator executed 5 timer callbacks for scheduling/debounce, rather than eliminating timers entirely. These counts describe this scenario, not a universal performance percentage. The fixture emits elapsed settling time, which includes a deliberate 350 ms observation wait; it is not a page-turn latency benchmark. There is no demonstrated reduction in build count or general reading latency from this change. The principal benefit is one ordering policy and removal of competing polling loops.

A second fixture holds a real pointer for 550 ms while issuing 61 competing requests. The host and layout remain intact until release; the latest layout then applies with no interrupted turn. Fifty redundant progressive-window notifications preserve the existing host without rebuilding.

## Regression checks

- `node tests/reader-coordinator-regression.mjs`: deterministic clock; latest callbacks, one outstanding timer, event wake, strict priority over debounce, bounded build deadline, synchronous idle return, lost-pointer recovery and cancellation.
- `npm run test:coordination`: real animation plus competing requests; completed-turn source anchor; deferred full relayout with real search; held real pointer and latest layout; unchanged-window DOM retention; programmatic synchronization under a held pointer. Runs in Chromium locally and in the three-engine CI matrix.
- Existing lifecycle suite: mobile/desktop resume, legacy progress, startup close, animation/layout overlap, latest layout, pointer hold, real polytonic 130% anchor restoration and legacy/progressive transitions.
- Existing progressive, fill, mobile, startup, memory, glossary, import and offline suites remain required. No existing assertions are removed; the extracted navigation harness adds stubs only for its new scheduling dependencies.

Local Firefox/WebKit startup is restricted by the container's browser sandbox and missing system libraries. Their application results must come from the GitHub Actions jobs, which install the required host dependencies. A browser launch failure is an environment blocker, not an application PASS.
