# Consistency audit — 60-question personality test

Generated: 2026-04-22T16:35:56.194Z
Questions loaded: 60
Axis breakdown: {"I_E":15,"N_S":15,"T_F":15,"J_P":15}

---

## Test A — Pure type (all 16 types, strong answers, 3x each)

**A.1 — Scoring engine isolated (adaptive skip OFF, all 60 Qs answered).**
Expected: same type code all 3 runs; minimum per-axis confidence >= 85%.

| Target | Got (3 runs) | Min axis conf | Spectrum (run 1) | Qs | Pass |
|---|---|---|---|---|---|
| INTJ | INTJ, INTJ, INTJ | 99% | I(99%) N(99%) T(99%) J(99%) | 60 | ✅ |
| INTP | INTP, INTP, INTP | 99% | I(99%) N(99%) T(99%) P(99%) | 60 | ✅ |
| ENTJ | ENTJ, ENTJ, ENTJ | 99% | E(99%) N(99%) T(99%) J(99%) | 60 | ✅ |
| ENTP | ENTP, ENTP, ENTP | 99% | E(99%) N(99%) T(99%) P(99%) | 60 | ✅ |
| INFJ | INFJ, INFJ, INFJ | 99% | I(99%) N(99%) F(99%) J(99%) | 60 | ✅ |
| INFP | INFP, INFP, INFP | 99% | I(99%) N(99%) F(99%) P(99%) | 60 | ✅ |
| ENFJ | ENFJ, ENFJ, ENFJ | 99% | E(99%) N(99%) F(99%) J(99%) | 60 | ✅ |
| ENFP | ENFP, ENFP, ENFP | 99% | E(99%) N(99%) F(99%) P(99%) | 60 | ✅ |
| ISTJ | ISTJ, ISTJ, ISTJ | 99% | I(99%) S(99%) T(99%) J(99%) | 60 | ✅ |
| ISFJ | ISFJ, ISFJ, ISFJ | 99% | I(99%) S(99%) F(99%) J(99%) | 60 | ✅ |
| ESTJ | ESTJ, ESTJ, ESTJ | 99% | E(99%) S(99%) T(99%) J(99%) | 60 | ✅ |
| ESFJ | ESFJ, ESFJ, ESFJ | 99% | E(99%) S(99%) F(99%) J(99%) | 60 | ✅ |
| ISTP | ISTP, ISTP, ISTP | 99% | I(99%) S(99%) T(99%) P(99%) | 60 | ✅ |
| ISFP | ISFP, ISFP, ISFP | 99% | I(99%) S(99%) F(99%) P(99%) | 60 | ✅ |
| ESTP | ESTP, ESTP, ESTP | 99% | E(99%) S(99%) T(99%) P(99%) | 60 | ✅ |
| ESFP | ESFP, ESFP, ESFP | 99% | E(99%) S(99%) F(99%) P(99%) | 60 | ✅ |

**A.1 overall:** ✅ PASS

**A.2 — Live adaptive flow (adaptive skip ON).**
Type should match all 3 runs. Per-axis confidence is expected to be ~67-80% because adaptive skip cuts off each axis once diff >= 16 is reached, capping the measurable lead. This is expected behavior, not a defect.

| Target | Got (3 runs) | Spectrum (run 1) | Qs answered |
|---|---|---|---|
| INTJ | INTJ, INTJ, INTJ | I(53%) N(53%) T(53%) J(53%) | 32 |
| INTP | INTP, INTP, INTP | I(53%) N(53%) T(53%) P(53%) | 32 |
| ENTJ | ENTJ, ENTJ, ENTJ | E(53%) N(53%) T(53%) J(53%) | 32 |
| ENTP | ENTP, ENTP, ENTP | E(53%) N(53%) T(53%) P(53%) | 32 |
| INFJ | INFJ, INFJ, INFJ | I(53%) N(53%) F(53%) J(53%) | 32 |
| INFP | INFP, INFP, INFP | I(53%) N(53%) F(53%) P(53%) | 32 |
| ENFJ | ENFJ, ENFJ, ENFJ | E(53%) N(53%) F(53%) J(53%) | 32 |
| ENFP | ENFP, ENFP, ENFP | E(53%) N(53%) F(53%) P(53%) | 32 |
| ISTJ | ISTJ, ISTJ, ISTJ | I(53%) S(53%) T(53%) J(53%) | 32 |
| ISFJ | ISFJ, ISFJ, ISFJ | I(53%) S(53%) F(53%) J(53%) | 32 |
| ESTJ | ESTJ, ESTJ, ESTJ | E(53%) S(53%) T(53%) J(53%) | 32 |
| ESFJ | ESFJ, ESFJ, ESFJ | E(53%) S(53%) F(53%) J(53%) | 32 |
| ISTP | ISTP, ISTP, ISTP | I(53%) S(53%) T(53%) P(53%) | 32 |
| ISFP | ISFP, ISFP, ISFP | I(53%) S(53%) F(53%) P(53%) | 32 |
| ESTP | ESTP, ESTP, ESTP | E(53%) S(53%) T(53%) P(53%) | 32 |
| ESFP | ESFP, ESFP, ESFP | E(53%) S(53%) F(53%) P(53%) | 32 |

**A.2 overall:** ✅ PASS (type consistency)

---

## Test B — All "In Between"

Expected: tie-break defaults to I, N, T, J. Confidence per axis should be the clamped minimum (1%).

- Type: **INTJ**
- Percentages: I(1%) N(1%) T(1%) J(1%)
- Pass: ✅

---

## Test C — Adaptive skip (12 strong-I, rest Not Sure)

Expected: after 12 strong-I answers, I/E axis is resolved; remaining I/E questions skipped; first letter of result = I.

- Type: **INTJ**
- Questions answered by axis: {"I_E":8,"N_S":15,"T_F":15,"J_P":15}
- I/E questions answered: 8 (expected <= 12 — adaptive skip should cap at threshold crossing)
- Spectrum: I(53%) N(1%) T(1%) J(1%)
- Pass: ✅

---

## Test D — Regression (5 old 24-Q patterns, new Qs = Not Sure)

Expected: type code matches the original 24-Q result. Percentages will be lower because only 6 Qs per axis were answered (max diff 12 out of 30 = 40% confidence).

| Pattern | Expected | Got | Match | Spectrum |
|---|---|---|---|---|
| Clear INTJ | INTJ | INTJ | ✅ | I(40%) N(40%) T(40%) J(40%) |
| Clear ENFP | ENFP | ENFP | ✅ | E(40%) N(40%) F(40%) P(40%) |
| Clear ISFJ | ISFJ | ISFJ | ✅ | I(40%) S(40%) F(40%) J(40%) |
| Clear ESTP | ESTP | ESTP | ✅ | E(40%) S(40%) T(40%) P(40%) |
| Clear INFP | INFP | INFP | ✅ | I(40%) N(40%) F(40%) P(40%) |

**Overall:** ✅ PASS
