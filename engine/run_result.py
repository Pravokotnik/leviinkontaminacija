from dataclasses import dataclass
from solutions_generator.solution import Solution

@dataclass
class RunResult:
    strategy_name: str
    n: int
    k: int
    steps: int
    success: bool
    solution: Solution
