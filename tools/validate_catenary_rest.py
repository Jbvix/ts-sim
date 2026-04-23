"""Valida a catenária de repouso: L fixo, S (vão) diminui => sag aumenta.
Espelha a lógica de reboqueoceanico242TSIM.html (solveCatenaryByU + solveCatenary_Symmetric)."""
import math


def solveCatenaryByU(S: float, L: float):
    if not (math.isfinite(S) and math.isfinite(L)) or S <= 0 or L <= 0:
        return None, None, False
    if L <= S * 1.000001:
        u = 1e-6
        a = S / (2 * u)
        return a, u, True

    r = L / S
    g = lambda u: (math.sinh(u) / u) - r  # noqa: E731
    u_lo, u_hi = 1e-6, 10.0
    while g(u_hi) < 0 and u_hi < 70:
        u_hi *= 1.5
    u_hi = min(u_hi, 70)
    if g(u_lo) > 0 and g(u_hi) > 0:
        u, a = 1e-3, S / (2e-3)
        return a, u, True
    u_lo, u_hi = 1e-6, u_hi
    for _ in range(60):
        u_mid = 0.5 * (u_lo + u_hi)
        if u_mid == u_lo or u_mid == u_hi:
            break
        val = g(u_mid)
        if abs(val) < 1e-10:
            a = S / (2 * u_mid)
            return a, u_mid, True
        if val > 0:
            u_hi = u_mid
        else:
            u_lo = u_mid
    u = 0.5 * (u_lo + u_hi)
    a = S / (2 * u)
    return a, u, True


def clampU(u: float) -> float:
    return min(max(u, 0), 60)


def coshC(u: float) -> float:
    return math.cosh(clampU(u))


def catenary_sag(L: float, S: float):
    L = max(L, 0.1)
    S = max(S, 0.1)
    a, u, _ok = solveCatenaryByU(S, L)
    if a is None:
        return 0.0, 0.0, 0.0
    if L > S:
        sag = a * (coshC(u) - 1)
    else:
        sag = 0.0
    return sag, a, u


def main():
    L = 200.0
    print("L (cabo pago) fixo =", L, "m")
    print("S = vao horizontal; sag = flecha (mesma definicao do T-Sim)\n")
    print(f"{'S (m)':>10} {'sag (m)':>12} {'delta_sag/ delta_S':>20}")
    prev_s, prev_S = None, None
    for S in [199, 195, 180, 150, 120, 100, 80, 50, 20]:
        s, a, u = catenary_sag(L, S)
        der = ""
        if prev_S is not None:
            der = f"{(s - prev_s) / (S - prev_S):+.6f}"
        print(f"{S:10.1f} {s:12.4f} {der:>20}")
        prev_s, prev_S = s, S

    # Monotonicity: sag should strictly increase as S decreases (d sag / dS < 0)
    S_grid = [2.0 * i for i in range(5, 100)]
    sags = [catenary_sag(L, S)[0] for S in S_grid]
    monotonic = all(sags[i] > sags[i + 1] for i in range(len(sags) - 1))
    print()
    if monotonic:
        print("OK: sag(S) decresce quando S aumenta (L fixo) <=> vao horizontal menor => sag maior.")
    else:
        print("FALHOU: monotonicidade.")
    # Joint: when S3 > L, T-Sim uses TAUT not catenary; simulate check
    print()
    print("Criterio T-Sim regime: TAUT se S3 - L > max(0.05, 1.2e-4*min(L,2000))")
    thr = max(0.05, 1.2e-4 * min(L, 2000))
    print(f"  L=200, limiar = {thr:.4f} m => S3>200.05 m forca mola, sag_UI=0")
    print("  Com S3<200.05: regime folgado; S_hz < S3 se diferenca de calado/bitas.")


if __name__ == "__main__":
    main()
