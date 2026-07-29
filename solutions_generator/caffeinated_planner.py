import heapq
from itertools import product
from graph.triangular_grid import TriangularGrid
from solutions_generator.solution import Solution
from solutions_generator.search_utils import build_search_context, permute_mask, reconstruct, spread_bitmask


# max stevilo edinstvenih stanj ki jih lahko dosezemo
MAX_STATES = 20_000_000


# hevristika A*: spodnja meja preostalih korakov (vsak korak ocisti najvec k vozlisc)
def _h(cont: int, k: int) -> int:
    return (bin(cont).count("1") + k - 1) // k


class CaffeinatedPlanner:

    def plan(self, graph: TriangularGrid, k: int) -> Solution | None:
        sol = self._astar(graph, k)
        if sol is not None:
            self.search_status = (
                f"[caffeinated] n={graph.n}: k={k} FEASIBLE (non-stacked)."
            )
        elif self._capped:
            self.search_status = (
                f"[caffeinated] n={graph.n}: k={k} NEDOLOČENO -- zadel "
                f"MAX_STATES (ni dokazano neizvedljivo)."
            )
        else:
            self.search_status = (
                f"[caffeinated] n={graph.n}: k={k} dokazano neizvedljiv "
                f"(non-stacked, naravno izčrpano)."
            )
        return sol

    # ---------------- A* ----------------

    def _astar(self, graph: TriangularGrid, k: int) -> Solution | None:
        # true == če presežemo MAX_STATES, false == uspeh A*
        self._capped = False
        V = graph.vertices
        if k > len(V):
            return None

        # sosedje za razvejanje
        nb_list: dict[int, tuple[int, ...]] = {
            v: tuple(graph.neighbours[v]) for v in V
        }
        # skupno ogrodje: bitmaske sosedov, polna maska, dihedralne permutacije
        nb_mask, full_mask, perms = build_search_context(graph)

        # fiksna zacetna pozicija (spodnjih k vozlisc)
        init_positions = tuple(sorted(V)[-k:])
        init_lion_mask = 0
        for v in init_positions:
            init_lion_mask |= (1 << v)
        init_cont = full_mask & ~init_lion_mask

        if init_cont == 0:
            return Solution(
                n=graph.n, k=k,
                initial_positions=init_positions,
                moves=(),
            )

        # leksikografsko najmanjsa maska trenutnega stanja
        def canonical(lion_mask: int, cont_mask: int) -> tuple:
            best = None
            for perm in perms:
                key = (permute_mask(lion_mask, perm), permute_mask(cont_mask, perm))
                if best is None or key < best:
                    best = key
            return best

        init_key = canonical(init_lion_mask, init_cont)

        # rekonstrukcija poti; vozlisce: (pozicije, kontaminacija, stars, kanonicni kljuc)
        nodes: list[tuple] = [(init_positions, init_cont, -1, init_key)]

        g_best: dict = {init_key: 0} # najmanj korakov

        h0 = _h(init_cont, k)
        counter = 0
        # heap = (ocena poti, cena doslej, tie-breaker, node id)
        # urejena po min oceni poti
        heap: list = [(h0, 0, counter, 0)]

        # A*
        while heap:
            # dobimo pozicije levov in kontaminacije
            f, g, _, node_id = heapq.heappop(heap)
            positions, cont, cur_key = nodes[node_id][0], nodes[node_id][1], nodes[node_id][3]

            # preverimo da je pot do sem najcenejsa (kanonicni kljuc shranjen ob
            # dodajanju; ocisceno stanje se v heap nikoli ne doda -- vrne se ze ob
            # generiranju naslednika)
            if g_best[cur_key] < g:
                continue

            # preverimo vse kombinacije vseh premikov naenkrat
            for next_tuple in product(*[nb_list[v] for v in positions]):
                # dodatna omejitev non-stacked, da je vsaka pozicija razlicna
                if len(set(next_tuple)) != k:
                    continue
                
                # nove pozicije levov
                new_lion_mask = 0
                for v in next_tuple:
                    new_lion_mask |= 1 << v

                # preckani robovi blokirajo sirjenje (premaknejo se vsi levi)
                traversed: set[tuple[int, int]] = set()
                for old, new in zip(positions, next_tuple):
                    a, b = (old, new) if old < new else (new, old)
                    traversed.add((a, b))

                new_cont = spread_bitmask(
                    cont, new_lion_mask, nb_mask, full_mask, traversed
                )

                # preverimo ali je to najcenejsa pot do sem oz nova pot
                new_g = g + 1
                key = canonical(new_lion_mask, new_cont)
                prev_g = g_best.get(key)
                if prev_g is not None and prev_g <= new_g:
                    continue
                g_best[key] = new_g

                new_id = len(nodes)
                nodes.append((next_tuple, new_cont, node_id, key))

                if new_cont == 0:
                    return reconstruct(nodes, new_id, graph.n, k)

                # hevristika - ocena preostalih korakov
                h_new = _h(new_cont, k)
                f_new = new_g + h_new
                counter += 1
                # stanje damo v heap
                heapq.heappush(heap, (f_new, new_g, counter, new_id))

            if len(g_best) > MAX_STATES:
                self._capped = True
                return None

        return None