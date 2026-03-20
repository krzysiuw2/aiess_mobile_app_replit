# AI Optimization Agent — Cost Analysis

This document provides a per-site cost analysis for the AI Optimization Agent over a 10-year BESS lifespan. Target: **~$1000 total** for Lambda, LLM, DynamoDB, and miscellaneous AWS services.

---

## 1. Cost Target

| Metric | Target |
|--------|--------|
| **Total budget** | $1000 per site over 10 years |
| **Per year** | ~$100/year per site |
| **Per month** | ~$8.33/month per site |

---

## 2. Component Breakdown

### 2.1 Amazon Bedrock (Claude Sonnet)

**Usage pattern:**

| Agent | Frequency | Tokens (input) | Tokens (output) |
|-------|-----------|----------------|-----------------|
| Daily | 1 call/day | ~2,000 | ~1,000 |
| Weekly | 1 call/week | ~3,000 | ~1,500 |
| Intraday | ~1–2 calls/day (gated) | ~1,500 avg | ~800 avg |

**Monthly estimate:** ~35 Bedrock calls per site.

**Pricing (Claude Sonnet, approximate):**
- Input: ~$3 / 1M tokens
- Output: ~$15 / 1M tokens

**Calculation:**
- Daily: 30 × (2K × $3/1M + 1K × $15/1M) ≈ 30 × $0.021 ≈ $0.63
- Weekly: 4 × (3K × $3/1M + 1.5K × $15/1M) ≈ 4 × $0.028 ≈ $0.11
- Intraday: ~45 × (1.5K × $3/1M + 0.8K × $15/1M) ≈ 45 × $0.017 ≈ $0.77

**Total Bedrock:** ~**$0.05–0.10/month per site** (conservative: ~$0.05 with gating).

---

### 2.2 AWS Lambda

**Invocation pattern:**

| Lambda | Invocations/month | Avg duration | Memory |
|--------|-------------------|--------------|--------|
| agent-daily | 30 | ~5 s | 512 MB |
| agent-weekly | 4 | ~10 s | 256 MB |
| agent-intraday | 96/day × 30 ≈ 2,880 | ~0.5 s | 256 MB |
| optimization-engine | Invoked by agents | ~1–2 s | 256 MB |

**Rough Lambda cost (on-demand):**
- 3,000+ invocations × ~2 s avg × 256–512 MB ≈ 6,000 GB-s/month
- At $0.0000166667/GB-s: ~$0.10/month

**Total Lambda:** ~**$0.10/month per site**.

---

### 2.3 DynamoDB (On-Demand)

**Usage per site:**

| Operation | Est. per month |
|-----------|----------------|
| Reads | ~500 (state, decisions, notifications) |
| Writes | ~400 (state updates, decision logs) |
| Storage | ~1–5 MB per site |

**Pricing (on-demand):**
- Reads: 500 × $0.25/1M ≈ $0.0001
- Writes: 400 × $1.25/1M ≈ $0.0005
- Storage: 5 MB × $0.25/GB ≈ $0.001

**Total DynamoDB:** ~**$0.25/month per site** (rounded up for safety).

---

### 2.4 InfluxDB

- Shared infrastructure across all sites.
- Per-site cost is **negligible** (queries are lightweight; data volume per site is small).

---

### 2.5 Other (EventBridge, API Gateway, etc.)

- EventBridge: Free tier covers typical usage.
- API Gateway: ~$0.01–0.05/month per site for agent API calls.
- **Total misc:** ~**$0.05/month per site**.

---

## 3. Total Monthly Cost per Site

| Component | $/month |
|-----------|---------|
| Bedrock | 0.05 |
| Lambda | 0.10 |
| DynamoDB | 0.25 |
| InfluxDB | 0 |
| Misc | 0.05 |
| **Total** | **~$0.50** |

---

## 4. 10-Year Projection

| Sites | Monthly | 10-Year Total | Per Site (10 yr) |
|-------|---------|---------------|------------------|
| 1 | $0.50 | $60 | $60 |
| 10 | $5 | $600 | $60 |
| 100 | $50 | $6,000 | $60 |
| 500 | $250 | $30,000 | $60 |

**At 500 sites:** $30,000 total over 10 years = **$60/site**, well under the $1000/site target.

---

## 5. Scaling Considerations

### 5.1 Site Growth Path

| Phase | Sites | Notes |
|-------|-------|-------|
| Pilot | 2 | Minimal cost; validate logic |
| Early | 20 | Linear scaling |
| Production | 500 | On-demand scales without changes |

### 5.2 DynamoDB

- **On-demand** scales linearly with traffic.
- No capacity planning required.
- Consider **provisioned** with auto-scaling only if cost optimization is critical at very high scale.

### 5.3 Lambda Cold Starts

- At 500 sites × 96 intraday invocations/day, intraday Lambda runs ~48,000 times/day.
- With 15-minute windows, concurrency is spread; cold starts are typically acceptable.
- **Provisioned concurrency** can be added for agent-api if latency is critical.

---

## 6. Cost Optimization Tips

1. **Bedrock:** Keep intraday gating strict (deviations >20% PV, >15% load, >10pp SoC) to minimize LLM calls.
2. **DynamoDB:** Use TTL on `aiess_agent_decisions` to avoid unbounded storage growth.
3. **Lambda:** Right-size memory (256 MB is often sufficient for intraday; 512 MB for daily if needed).
4. **Reserved capacity:** For predictable workloads, consider Reserved Instances or Savings Plans for Lambda (via Compute Savings Plans).

---

## 7. Related Documentation

- [00_OVERVIEW.md](./00_OVERVIEW.md) — Architecture and cost target
- [09_DEPLOYMENT.md](./09_DEPLOYMENT.md) — Deployment guide
- [11_FUTURE_ROADMAP.md](./11_FUTURE_ROADMAP.md) — Future enhancements (may affect costs)
