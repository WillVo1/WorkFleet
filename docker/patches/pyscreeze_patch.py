"""Patch pyscreeze to force X11 + scrot mode on headless Linux.

Applied at build time via sed in the Dockerfile. This file is kept as
documentation of the patches applied.
"""

# Force these values in pyscreeze/__init__.py:
#   RUNNING_X11 = True              (always use X11 path)
#   GNOMESCREENSHOT_EXISTS = False  (never try gnome-screenshot)
#
# This ensures pyscreeze always uses `scrot` for screenshots on headless Xvfb,
# regardless of what it autodetects at runtime.
