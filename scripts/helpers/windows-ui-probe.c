/* Read-only Win32 control inspection for the Wine installer UI check.
 * Compiled with Wine's winegcc; never clicks or sends a write command.
 * APIs: EnumChildWindows, WM_GETTEXT, CB_GETCOUNT/GETLBTEXTLEN/GETLBTEXT.
 */
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

static int first_window = 1, first_child = 1;
static DWORD_PTR message(HWND hwnd, UINT id, WPARAM wp, LPARAM lp) {
  DWORD_PTR value = 0;
  SendMessageTimeoutW(hwnd, id, wp, lp, SMTO_ABORTIFHUNG | SMTO_BLOCK, 500, &value);
  return value;
}
static void string_json(const WCHAR *text) {
  char utf8[65536];
  int n = WideCharToMultiByte(CP_UTF8, 0, text, -1, utf8, sizeof(utf8), NULL, NULL);
  if (!n) { printf("\"\""); return; }
  putchar('"');
  for (int i = 0; i < n - 1; i++) {
    unsigned char c = (unsigned char) utf8[i];
    if (c == '"' || c == '\\') { putchar('\\'); putchar(c); }
    else if (c < 32) printf("\\u%04x", c);
    else putchar(c);
  }
  putchar('"');
}
static void describe(HWND hwnd) {
  WCHAR title[8192] = {0}, klass[128] = {0}; RECT r; DWORD pid = 0;
  message(hwnd, WM_GETTEXT, 8192, (LPARAM) title);
  GetClassNameW(hwnd, klass, 128); GetWindowRect(hwnd, &r);
  GetWindowThreadProcessId(hwnd, &pid);
  printf("{\"handle\":\"%llu\",\"pid\":%lu,\"id\":%d,\"visible\":%s,\"enabled\":%s,\"class\":",
    (unsigned long long)(uintptr_t)hwnd, (unsigned long)pid, GetDlgCtrlID(hwnd),
    IsWindowVisible(hwnd) ? "true" : "false", IsWindowEnabled(hwnd) ? "true" : "false");
  string_json(klass); printf(",\"text\":"); string_json(title);
  printf(",\"rect\":{\"x\":%ld,\"y\":%ld,\"width\":%ld,\"height\":%ld}",
    (long)r.left, (long)r.top, (long)(r.right-r.left), (long)(r.bottom-r.top));
  if (lstrcmpiW(klass, L"ComboBox") == 0) {
    int count = (int)message(hwnd, CB_GETCOUNT, 0, 0);
    printf(",\"selectedIndex\":%ld,\"items\":[", (long)message(hwnd, CB_GETCURSEL, 0, 0));
    if (count < 0 || count > 100) count = 0;
    for (int i = 0; i < count; i++) {
      if (i) putchar(',');
      int len = (int)message(hwnd, CB_GETLBTEXTLEN, i, 0);
      if (len < 0 || len > 8191) { printf("null"); continue; }
      WCHAR *buf = calloc((size_t)len + 1, sizeof(WCHAR));
      if (!buf) { printf("null"); continue; }
      message(hwnd, CB_GETLBTEXT, i, (LPARAM)buf); string_json(buf); free(buf);
    }
    putchar(']');
  }
}
static BOOL CALLBACK child(HWND hwnd, LPARAM ignored) {
  (void)ignored;
  if (!first_child) putchar(','); first_child = 0;
  describe(hwnd); putchar('}'); return TRUE;
}
static int contains(const WCHAR *text, const WCHAR *needle) {
  int n = lstrlenW(needle);
  for (; *text; text++) {
    int i = 0; while (i < n && text[i] && text[i] == needle[i]) i++;
    if (i == n) return 1;
  }
  return 0;
}
static BOOL CALLBACK window(HWND hwnd, LPARAM ignored) {
  (void)ignored;
  if (!IsWindowVisible(hwnd)) return TRUE;
  WCHAR title[8192] = {0}; message(hwnd, WM_GETTEXT, 8192, (LPARAM)title);
  /* Explicitly scope inspection to this app's installer dialogs. */
  if (!contains(title, L"Inkstone") && !contains(title, L"inkstone")) return TRUE;
  if (!first_window) putchar(','); first_window = 0;
  describe(hwnd); printf(",\"controls\":["); first_child = 1;
  EnumChildWindows(hwnd, child, 0); printf("]}"); return TRUE;
}
int main(void) {
  SetProcessDPIAware(); printf("{\"windows\":[");
  EnumWindows(window, 0); printf("]}\n"); fflush(stdout); return 0;
}
