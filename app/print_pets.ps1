param([string]$Out = "$env:TEMP\heshen-pets")
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class PetWin {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern int GetWindowTextLengthW(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public struct POINT { public int X, Y; }

  public class Item { public string kind; public string title; public int x, y, w, h; public string png; }

  /**
   * 把标题里含 needle 的可见窗口各自 PrintWindow 成 PNG，并记下客户区在屏幕上的位置（DIP）。
   * kind 用来区分「桌宠窗口」和「DSH 主窗口（网页里的宠物画在这里）」。
   */
  public static List<Item> Grab(string needle, string dir, string kind, int indexBase) {
    var items = new List<Item>();
    int index = indexBase;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      int len = GetWindowTextLengthW(h);
      if (len <= 0) return true;
      var sb = new StringBuilder(len + 1);
      GetWindowTextW(h, sb, sb.Capacity);
      if (sb.ToString().IndexOf(needle, StringComparison.OrdinalIgnoreCase) < 0) return true;
      RECT r; POINT p = new POINT();
      if (!GetClientRect(h, out r)) return true;
      if (!ClientToScreen(h, ref p)) return true;
      int w = r.Right - r.Left, hh = r.Bottom - r.Top;
      if (w < 40 || hh < 40) return true;
      var bmp = new System.Drawing.Bitmap(w, hh);
      var g = System.Drawing.Graphics.FromImage(bmp);
      IntPtr hdc = g.GetHdc();
      bool ok = PrintWindow(h, hdc, 2);
      g.ReleaseHdc(hdc);
      g.Dispose();
      if (ok) {
        string file = System.IO.Path.Combine(dir, kind + "-" + index + ".png");
        bmp.Save(file, System.Drawing.Imaging.ImageFormat.Png);
        items.Add(new Item { kind = kind, title = sb.ToString(), x = p.X, y = p.Y, w = w, h = hh, png = file });
        index++;
      }
      bmp.Dispose();
      return true;
    }, IntPtr.Zero);
    return items;
  }
}
"@ -ReferencedAssemblies System.Drawing
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Get-ChildItem $Out -Filter '*.png' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
$items = New-Object System.Collections.ArrayList
foreach ($it in [PetWin]::Grab('dsh-pet 桌宠', $Out, 'pet', 0)) { [void]$items.Add($it) }
foreach ($it in [PetWin]::Grab('DeepSeek Harness', $Out, 'page', 0)) { [void]$items.Add($it) }
$list = @()
foreach ($it in $items) {
  $list += [pscustomobject]@{ kind = $it.kind; title = $it.title; x = $it.x; y = $it.y; w = $it.w; h = $it.h; png = $it.png }
}
ConvertTo-Json -InputObject $list -Compress -Depth 4
