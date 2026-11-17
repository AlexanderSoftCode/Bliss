# Aether-ML

A deep learning framework built from the ground up based on two numerical libraries NumPy and CuPy, with hand written GPU kernels for both CUDA and ROCm.

## Workflow

- I'll usually bring a plan. Before writing code, go over it with me: point
  out gaps, risks and open questions, and say what you'd do differently. 
- If something during implementation means the plan should change, stop and tell me
  instead of quietly deciding that tradeoff for me.

## Tests

Use `unittest`, not pytest: 
`.claude/dx python3 -m unittest discover -q tests` (about 7s; always run the whole suite).
New layer, loss, or activation tests must follow `tests/_unit_test_skeleton.py`.

**Avoid tautological tests.** A test exists to catch bugs, so it has to be
able to fail when the implementation is wrong. A tautological test restates
the implementation and passes no matter what the code does.

For example, testing ReLU with `expected = xp.maximum(0, x)` just repeats
the forward pass: if `maximum` is wrong, the test is wrong in the same way
and still passes. Instead, use hand-written inputs and outputs
(`[-1, 0, 2] -> [0, 0, 2]`), or for gradients compare the backward pass
against finite differences.

In practice:
- Get expected values independently: hand-computed values, a naive reference
  implementation, or a known mathematical identity.
- Prefer a few strong tests over many atomic ones; consolidate when one test
  can replace several.
- Never loosen tolerances to make a test pass.

## GPU devcontainer

Run Python and tests in the ROCm devcontainer, not on the host, through the
wrapper: `.claude/dx <command>`. It finds the container by label and runs as
the ubuntu user.

## PR messages

Follow [the PR template](.github/pull_request_template.md) when writing PR titles and descriptions.

## Code rules

- Keep it minimal: no speculative options, parameters or abstractions; if a
  helper already exists, reuse it instead of adding a near-copy.
- Import config as a module (`import aether.config as config`), never
  `from aether.config import xp`: `set_backend()` reassigns `config.xp`, so a
  from-import keeps a stale backend. In forward/backward, get the array module
  from the data (`xp = config.get_array_module(x)`); read `config.xp` only at
  build/init time. Only touch `config.cp` inside GPU-only branches.
- No dependencies beyond NumPy, CuPy and safetensors.
- Each kernel has a fixed dtype, and the calling layer casts to it before
  launch. Most take contiguous fp32, as BatchNorm and GlobalAvgPool do.
  Conv's WMMA path takes fp16 and falls back to the vectorized fp32 path
  when tensor cores are unavailable. A layer that must ignore the model's
  precision policy sets the class attribute `_precision_exempt = True`
  (SoftMax, BatchNorm). Don't add a constructor flag for this.
- Every GPU path has a CPU/vectorized fallback, bound in `_compile_for_device`.
  Build kernels with `config.build_kernel` / `config.fuse_kernel`; they return
  `None` without CuPy, which means "use the fallback". CuPy compiles lazily,
  so a kernel that can fail to compile on some GPUs must catch it at launch,
  as conv does.
- New public names go in both the package's lazy map (`__init__.py`) and its
  `.pyi` stub.
- New error and warning messages start with `[aether]`.

## Definition of done

Before saying a change is finished:
- The full suite passes in the devcontainer.
- Every bug fix has a regression test, confirmed to fail on the old code.
- Report what you could not verify (e.g. a path with no test), not just what passed.
- CUDA-only paths (e.g. Conv's WMMA path) can't run in this container. I verify
  them on the laptop after the PR is open, so mark CUDA parity as pending under
  Testing in the PR description instead of treating it as a blocker.
