# Load test results

Run 2026-10-11T17:36:43.664Z on AMD Ryzen 7 5800HS with Radeon Graphics (16 logical cores), 17 GB RAM, Windows_NT 10.0.26200, Node v22.23.3.
API: local, same machine as the load generator; MongoDB Atlas (remote); Upstash Redis (remote, TLS).

## Live quiz: 50 players, 5 questions

Connected 50/50 (all joined in 1099 ms); answers accepted 250/250; errors 0.

| ms | samples | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| question reaches player | 250 | 150 | 156 | 158 | 158 |
| answer acknowledged | 250 | 216 | 234 | 662 | 669 |
| reveal after last answer | 250 | 581 | 588 | 589 | 589 |

## Live quiz: 100 players, 5 questions

Connected 100/100 (all joined in 2093 ms); answers accepted 500/500; errors 0.

| ms | samples | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| question reaches player | 500 | 149 | 154 | 157 | 157 |
| answer acknowledged | 500 | 215 | 226 | 247 | 696 |
| reveal after last answer | 500 | 586 | 596 | 598 | 598 |

## Live quiz: 200 players, 5 questions

Connected 200/200 (all joined in 3944 ms); answers accepted 1000/1000; errors 0.

| ms | samples | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| question reaches player | 1000 | 156 | 170 | 172 | 173 |
| answer acknowledged | 1000 | 214 | 227 | 245 | 735 |
| reveal after last answer | 1000 | 605 | 627 | 630 | 630 |
