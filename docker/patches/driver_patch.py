"""Patch hai_drivers desktop driver to use pyautogui for keyboard instead of pynput.

pynput's XTEST keyboard events do NOT land in focused windows under Xvfb.
pyautogui's keyboard DOES land. This patch replaces all pynput keyboard calls
with pyautogui equivalents.

Applied at build time via sed in the Dockerfile.
"""

# Replacements in hai_drivers/desktop/local/driver.py:
#   self._keyboard.type(char)       ->  pyautogui.write(char)
#   self._keyboard.type(text)       ->  pyautogui.write(text)
#   self._keyboard.press(key_parsed) ->  pyautogui.keyDown(str(key_parsed))
#   self._keyboard.release(key_parsed) ->  pyautogui.keyUp(str(key_parsed))
