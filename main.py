import json
import time
from datetime import datetime
from pathlib import Path

from engine.engine import Engine
from graph.graph_state import GraphState
from graph.triangular_grid import TriangularGrid
from solutions_generator.caffeinated_planner import CaffeinatedPlanner
from solutions_generator.monotone_planner import MonotonePlanner
from solutions_generator.polite_planner import PolitePlanner
from solutions_generator.strip_planner import StripPlanner
from solutions_generator.search_utils import lower_bound_k
from strategies.replay_strategy import ReplayStrategy


OUT_DIR = Path("final_solutions")
TIMES_PATH = OUT_DIR / "times.json"


def _save_solution(run_result, search_status: str | None = None) -> Path:
    OUT_DIR.mkdir(exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    out_path = OUT_DIR / f"{run_result.strategy_name}_n{run_result.n}_k{run_result.k}_{ts}.json"

    payload = {
        "strategy": run_result.strategy_name,
        "n": run_result.n,
        "k": run_result.k,
        "steps": run_result.steps,
        "success": run_result.success,
        "search_status": search_status,
        "initial_positions": list(run_result.solution.initial_positions),
        "moves": [list(move) for move in run_result.solution.moves],
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return out_path


# ---------------- Merjenje časov ----------------
# k_times so {k: sekunde} za vsak k, ki ga je iskalec poskusil (linearno od lo navzgor, se ustavi pri prvem feasible k -- to je iskani minimum)
# k_status so {k: status} za vsak poskušeni k: ali je bila rešitev najdena, ali je bil k dokazano neizvedljiv (naravno izčrpano) ali le nedoločen (zadel MAX_STATES). Tako se izid vsakega zavrnjenega k' < best_k ohrani in ne le izid zmagovalnega k.
TIMES: dict = {}


def _new_entry() -> dict:
    return {"total_s": None, "best_k": None, "k_times": {}, "k_status": {}}


def _planner_status(planner, sol) -> str | None:
    """Vrni status iskanja za en plan(k) klic.

    Če ima planer polje `search_status` (vljudni, kofeinirani, strip), ga uporabi
    neposredno. Sicer (monotoni planer nastavi le interno zastavico `_capped`)
    status izpeljemo iz `_capped` in tega, ali je bila rešitev najdena.
    """
    status = getattr(planner, "search_status", None)
    if status is not None:
        return status
    if sol is not None:
        return "FEASIBLE"
    capped = getattr(planner, "_capped", None)
    if capped is True:
        return "NEDOLOČENO -- zadel MAX_STATES (ni dokazano neizvedljivo)"
    if capped is False:
        return "dokazano neizvedljiv (naravno izčrpano)"
    return None


def _load_existing_times() -> dict:
    if TIMES_PATH.exists():
        try:
            with open(TIMES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_times() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    # Združimo z že obstoječim, da rezultatov drugih strategij ne povozimo.
    merged = _load_existing_times()
    for strat, by_n in TIMES.items():
        merged.setdefault(strat, {})
        for n_key, payload in by_n.items():
            merged[strat][n_key] = payload
    with open(TIMES_PATH, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)


def _record_time(strategy: str, n: int, total_s: float, best_k: int | None,
                 k_times: dict, k_status: dict | None = None) -> None:
    TIMES.setdefault(strategy, {})
    TIMES[strategy][str(n)] = {
        "total_s": total_s,
        "best_k": best_k,
        "k_times": {str(k): t for k, t in k_times.items()},
        "k_status": {str(k): s for k, s in (k_status or {}).items()},
    }
    _save_times()
    breakdown = (
        " | ".join(f"k={k}: {t*1000:.1f} ms" for k, t in k_times.items())
        if k_times else "(brez k-iteracije)"
    )
    print(f"  [time] {strategy} n={n}: skupaj {total_s*1000:.1f} ms ({breakdown})")


def _record_k_time(strategy: str, n: int, k: int, elapsed_s: float,
                   status: str | None = None) -> None:
    """Write a single k result (time + status) into times.json immediately,
    without waiting for the full loop. Tako se izid vsakega k ohrani tudi, če
    tek prekinemo sredi iteracije."""
    TIMES.setdefault(strategy, {})
    entry = TIMES[strategy].setdefault(str(n), _new_entry())
    entry["k_times"][str(k)] = elapsed_s
    entry.setdefault("k_status", {})[str(k)] = status
    _save_times()


# ---------------- Strip (brez k-iteracije) ----------------
def run_strip(n: int):
    graph = TriangularGrid(n)
    planner = StripPlanner()
    t0 = time.perf_counter()
    solution = planner.plan_best(graph)
    total_s = time.perf_counter() - t0
    state = GraphState(graph=graph, lion_positions=list(solution.initial_positions))
    result = Engine(graph=graph, state=state,
                    strategy=ReplayStrategy(solution), strategy_name="strip").run()
    _save_solution(result, getattr(planner, "search_status", None))
    _record_time("strip", n, total_s, solution.k, {})
    return result


# ---------------- Skupna pot za planerje s k-iteracijo ----------------
def _run_with_k_iteration(name: str, planner_cls, n: int):
    """Iteriraj k od `lo` (analitična spodnja meja) do `n + 1` (varovalna zgornja
    meja; k = n vedno zadošča) in poskusi vsako vrednost s svežim planerjem. Meri čas
    vsakega plan(k) klica; ustavi se pri prvem feasible k (to je minimum). Vrne
    RunResult najboljšega k.
    """
    graph = TriangularGrid(n)
    lo = lower_bound_k(n)
    hi = n + 1

    k_times: dict[int, float] = {}
    k_status: dict[int, str | None] = {}
    best_sol = None
    best_planner = None

    # Write the n entry immediately so it appears in times.json even if cancelled mid-run.
    TIMES.setdefault(name, {})
    TIMES[name].setdefault(str(n), _new_entry())
    _save_times()

    total_start = time.perf_counter()
    for k in range(lo, hi + 1):
        # Svež planer za vsak k, da meritev odraža čisti čas iskanja pri tem k.
        planner_k = planner_cls()
        t0 = time.perf_counter()
        sol = planner_k.plan(graph, k)
        k_times[k] = time.perf_counter() - t0
        # Status tega k (najden / naravno izčrpano / zadel MAX_STATES) zabeležimo
        # takoj, da se izid vsakega zavrnjenega k' ohrani tudi ob prekinitvi.
        k_status[k] = _planner_status(planner_k, sol)
        _record_k_time(name, n, k, k_times[k], k_status[k])
        if sol is not None:
            best_sol = sol
            best_planner = planner_k
            break
    total_s = time.perf_counter() - total_start

    if best_sol is None:
        raise RuntimeError(
            f"{name}: ni rešitve za n={n} pri k ∈ [{lo}, {hi}]."
        )

    state = GraphState(graph=graph, lion_positions=list(best_sol.initial_positions))
    result = Engine(graph=graph, state=state,
                    strategy=ReplayStrategy(best_sol),
                    strategy_name=name).run()
    _save_solution(result, getattr(best_planner, "search_status", None))
    _record_time(name, n, total_s, best_sol.k, k_times, k_status)
    return result


def run_monotone(n: int):
    return _run_with_k_iteration("monotone", MonotonePlanner, n)


def run_polite(n: int):
    return _run_with_k_iteration("polite", PolitePlanner, n)


def run_caffeinated(n: int):
    return _run_with_k_iteration("caffeinated", CaffeinatedPlanner, n)


if __name__ == "__main__":
    # --- Odkomentiraj kar želiš pognati ---
    # Vsi rezultati (vključno s časi v `final_solutions/times.json`) se posodobijo po vsakem n.

    # Strip strategija
    #for n in range(3, 9):
        #r = run_strip(n=n)
        #print(f"Strip    -> n={r.n}, k={r.k}, koraki={r.steps}, uspeh={r.success}")

    # Monotona strategija
    #for n in range(3, 9):
        #r = run_monotone(n=n)
        #print(f"Monotone -> n={r.n}, k={r.k}, koraki={r.steps}, uspeh={r.success}")

    # Polite strategija
    #for n in range(3, 7):
        #r = run_polite(n=n)
        #print(f"Polite   -> n={r.n}, k={r.k}, koraki={r.steps}, uspeh={r.success}")

    # Caffeinated strategija
    for n in range(7, 9):
        r = run_caffeinated(n=n)
        print(f"Caffeinated -> n={r.n}, k={r.k}, koraki={r.steps}, uspeh={r.success}")