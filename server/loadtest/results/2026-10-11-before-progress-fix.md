# Load test results

Run 2026-10-11T17:33:04.832Z on AMD Ryzen 7 5800HS with Radeon Graphics (16 logical cores), 17 GB RAM, Windows_NT 10.0.26200, Node v22.23.3.
API: local, same machine as the load generator; MongoDB Atlas (remote); Upstash Redis (remote, TLS).

## Live quiz: 50 players, 5 questions

Connected 50/50 (all joined in 1056 ms); answers accepted 250/250; errors 0.

| ms | samples | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| question reaches player | 250 | 143 | 148 | 149 | 149 |
| answer acknowledged | 250 | 280 | 303 | 729 | 767 |
| reveal after last answer | 250 | 633 | 688 | 690 | 690 |

## Live quiz: 100 players, 5 questions

Connected 100/100 (all joined in 2119 ms); answers accepted 500/500; errors 0.

| ms | samples | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| question reaches player | 500 | 144 | 158 | 160 | 161 |
| answer acknowledged | 500 | 286 | 331 | 376 | 755 |
| reveal after last answer | 500 | 647 | 671 | 673 | 673 |

## Live quiz: 200 players, 5 questions

Connected 200/200 (all joined in 4003 ms); answers accepted 1000/1000; errors 0.

| ms | samples | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| question reaches player | 1000 | 150 | 163 | 166 | 166 |
| answer acknowledged | 1000 | 326 | 726 | 1936 | 2351 |
| reveal after last answer | 1000 | 961 | 2253 | 2255 | 2256 |

## Contest judge: 50 simultaneous submissions

60% correct, 20% wrong answer, 20% infinite loop; 6 tests each, 300 ms limit. Judged 50/50 in 31759 ms (1.57 submissions/s); verdicts {"Accepted":30,"Wrong Answer":10,"Time Limit Exceeded":10}; wrong verdicts 0; errors 0.

| ms | samples | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| submit acknowledged (202) | 50 | 1814 | 1848 | 2036 | 2036 |
| queued -> verdict saved | 50 | 13146 | 29688 | 30552 | 30552 |
