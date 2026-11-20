Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$ServerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ServerDir
$ServerJs = Join-Path $ServerDir "server.js"
$LogFile = Join-Path $ServerDir "server.log"
$TrayPidFile = Join-Path $ServerDir "tray.pid"
$NodePidFile = Join-Path $ServerDir "node.pid"

Set-Content -Path $TrayPidFile -Value $PID -Encoding ascii

if (-not (Test-Path (Join-Path $ServerDir "node_modules"))) {
  Start-Process -FilePath "npm.cmd" -ArgumentList "--prefix `"$ServerDir`" install" -WindowStyle Hidden -Wait | Out-Null
}

if (Get-Command tailscale -ErrorAction SilentlyContinue) {
  Start-Process -FilePath "tailscale" -ArgumentList "funnel --bg 3000" -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
}

function Create-CoilballIcon {
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 14, 165, 233))
  $innerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 197, 94))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 2
  $g.FillEllipse($bgBrush, 2, 2, 28, 28)
  $g.FillEllipse($innerBrush, 9, 9, 14, 14)
  $g.DrawEllipse($pen, 2, 2, 28, 28)
  $g.Dispose()
  $hIcon = $bmp.GetHicon()
  return [System.Drawing.Icon]::FromHandle($hIcon)
}

$script:nodeProc = $null
$script:wantRunning = $true
$script:quitting = $false
$script:appIcon = Create-CoilballIcon
$script:showEvent = New-Object System.Threading.EventWaitHandle($false, [System.Threading.EventResetMode]::AutoReset, "Local\CoilballServerAppShow")

function Start-NodeServer {
  if ($script:nodeProc -and -not $script:nodeProc.HasExited) { return }
  $script:wantRunning = $true
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "node.exe"
  $psi.Arguments = "`"$ServerJs`""
  $psi.WorkingDirectory = $RootDir
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  $p.Start() | Out-Null
  Set-Content -Path $NodePidFile -Value $p.Id -Encoding ascii
  $script:nodeProc = $p

  [System.Threading.Tasks.Task]::Run([Action]{
    try {
      while (-not $p.StandardOutput.EndOfStream) {
        $line = $p.StandardOutput.ReadLine()
        Add-Content -Path $LogFile -Value ("[" + (Get-Date -Format "HH:mm:ss") + "] " + $line) -Encoding UTF8
      }
    } catch {}
  }) | Out-Null
  [System.Threading.Tasks.Task]::Run([Action]{
    try {
      while (-not $p.StandardError.EndOfStream) {
        $line = $p.StandardError.ReadLine()
        Add-Content -Path $LogFile -Value ("[" + (Get-Date -Format "HH:mm:ss") + "] [ERR] " + $line) -Encoding UTF8
      }
    } catch {}
  }) | Out-Null
}

function Stop-NodeServer {
  $script:wantRunning = $false
  if ($script:nodeProc -and -not $script:nodeProc.HasExited) {
    try { $script:nodeProc.Kill() } catch {}
    try { $script:nodeProc.WaitForExit(1500) | Out-Null } catch {}
  }
  $script:nodeProc = $null
  Remove-Item -Path $NodePidFile -ErrorAction SilentlyContinue
}

# --- Fenêtre principale ---
$bgDark = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)
$bgCard = [System.Drawing.Color]::FromArgb(255, 30, 41, 59)
$fgText = [System.Drawing.Color]::FromArgb(255, 241, 245, 249)
$fgMuted = [System.Drawing.Color]::FromArgb(255, 148, 163, 184)
$accentBlue = [System.Drawing.Color]::FromArgb(255, 56, 189, 248)
$accentGreen = [System.Drawing.Color]::FromArgb(255, 34, 197, 94)
$accentRed = [System.Drawing.Color]::FromArgb(255, 239, 68, 68)
$accentAmber = [System.Drawing.Color]::FromArgb(255, 245, 158, 11)

$form = New-Object System.Windows.Forms.Form
$form.Text = "Coilball — Serveur Multijoueur"
$form.Size = New-Object System.Drawing.Size(650, 520)
$form.MinimumSize = New-Object System.Drawing.Size(620, 460)
$form.StartPosition = "CenterScreen"
$form.BackColor = $bgDark
$form.ForeColor = $fgText
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$form.Icon = $script:appIcon

$titleLbl = New-Object System.Windows.Forms.Label
$titleLbl.Text = "Coilball — Serveur Multijoueur"
$titleLbl.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$titleLbl.ForeColor = $accentBlue
$titleLbl.Location = New-Object System.Drawing.Point(18, 14)
$titleLbl.AutoSize = $true
$form.Controls.Add($titleLbl)

$statusLbl = New-Object System.Windows.Forms.Label
$statusLbl.Text = "● Démarrage..."
$statusLbl.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$statusLbl.ForeColor = $accentAmber
$statusLbl.Location = New-Object System.Drawing.Point(20, 46)
$statusLbl.AutoSize = $true
$form.Controls.Add($statusLbl)

$infoLbl = New-Object System.Windows.Forms.Label
$infoLbl.Text = "URL publique : wss://symphonia.tail69ad79.ts.net   |   Port local : 3000"
$infoLbl.ForeColor = $fgMuted
$infoLbl.Location = New-Object System.Drawing.Point(20, 70)
$infoLbl.AutoSize = $true
$form.Controls.Add($infoLbl)

function New-ActionButton($text, $x, $y, $w, $bgColor) {
  $btn = New-Object System.Windows.Forms.Button
  $btn.Text = $text
  $btn.Location = New-Object System.Drawing.Point($x, $y)
  $btn.Size = New-Object System.Drawing.Size($w, 32)
  $btn.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
  $btn.FlatAppearance.BorderSize = 0
  $btn.BackColor = $bgColor
  $btn.ForeColor = [System.Drawing.Color]::White
  $btn.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
  $btn.Cursor = [System.Windows.Forms.Cursors]::Hand
  return $btn
}

$btnStart = New-ActionButton "Démarrer" 20 104 95 ([System.Drawing.Color]::FromArgb(255, 22, 163, 74))
$btnStop = New-ActionButton "Arrêter" 123 104 88 ([System.Drawing.Color]::FromArgb(255, 220, 38, 38))
$btnRestart = New-ActionButton "Redémarrer" 219 104 102 ([System.Drawing.Color]::FromArgb(255, 2, 132, 199))
$btnHealth = New-ActionButton "Ouvrir /health" 329 104 110 $bgCard
$btnLogs = New-ActionButton "Logs" 447 104 70 $bgCard
$btnQuit = New-ActionButton "Quitter l'app" 525 104 92 ([System.Drawing.Color]::FromArgb(255, 71, 85, 105))

$form.Controls.AddRange(@($btnStart, $btnStop, $btnRestart, $btnHealth, $btnLogs, $btnQuit))

$summaryLbl = New-Object System.Windows.Forms.Label
$summaryLbl.Text = "Salons actifs : 0   |   Joueurs connectés : 0"
$summaryLbl.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$summaryLbl.ForeColor = $fgText
$summaryLbl.Location = New-Object System.Drawing.Point(20, 150)
$summaryLbl.AutoSize = $true
$form.Controls.Add($summaryLbl)

$roomsBox = New-Object System.Windows.Forms.TextBox
$roomsBox.Location = New-Object System.Drawing.Point(20, 176)
$roomsBox.Size = New-Object System.Drawing.Size(606, 210)
$roomsBox.Anchor = "Top,Bottom,Left,Right"
$roomsBox.Multiline = $true
$roomsBox.ReadOnly = $true
$roomsBox.ScrollBars = "Vertical"
$roomsBox.BackColor = $bgCard
$roomsBox.ForeColor = $fgText
$roomsBox.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$roomsBox.Font = New-Object System.Drawing.Font("Consolas", 9.5)
$roomsBox.Text = "Initialisation du serveur..."
$form.Controls.Add($roomsBox)

# --- Barre de modération (Fermer salon / Bannir IP) ---
$roomModLbl = New-Object System.Windows.Forms.Label
$roomModLbl.Text = "Salon :"
$roomModLbl.ForeColor = $fgMuted
$roomModLbl.Location = New-Object System.Drawing.Point(20, 402)
$roomModLbl.Anchor = "Bottom,Left"
$roomModLbl.AutoSize = $true
$form.Controls.Add($roomModLbl)

$roomCombo = New-Object System.Windows.Forms.ComboBox
$roomCombo.Location = New-Object System.Drawing.Point(70, 398)
$roomCombo.Size = New-Object System.Drawing.Size(80, 24)
$roomCombo.Anchor = "Bottom,Left"
$roomCombo.BackColor = $bgCard
$roomCombo.ForeColor = $fgText
$form.Controls.Add($roomCombo)

$btnCloseRoom = New-ActionButton "Fermer le salon" 156 395 118 ([System.Drawing.Color]::FromArgb(255, 180, 83, 9))
$btnCloseRoom.Anchor = "Bottom,Left"
$form.Controls.Add($btnCloseRoom)

$ipModLbl = New-Object System.Windows.Forms.Label
$ipModLbl.Text = "IP :"
$ipModLbl.ForeColor = $fgMuted
$ipModLbl.Location = New-Object System.Drawing.Point(288, 402)
$ipModLbl.Anchor = "Bottom,Left"
$ipModLbl.AutoSize = $true
$form.Controls.Add($ipModLbl)

$ipCombo = New-Object System.Windows.Forms.ComboBox
$ipCombo.Location = New-Object System.Drawing.Point(316, 398)
$ipCombo.Size = New-Object System.Drawing.Size(130, 24)
$ipCombo.Anchor = "Bottom,Left"
$ipCombo.BackColor = $bgCard
$ipCombo.ForeColor = $fgText
$form.Controls.Add($ipCombo)

$btnBanIp = New-ActionButton "Bannir IP" 452 395 82 ([System.Drawing.Color]::FromArgb(255, 185, 28, 28))
$btnBanIp.Anchor = "Bottom,Left"
$form.Controls.Add($btnBanIp)

$btnUnbanIp = New-ActionButton "Débannir" 540 395 86 $bgCard
$btnUnbanIp.Anchor = "Bottom,Left"
$form.Controls.Add($btnUnbanIp)

$hintLbl = New-Object System.Windows.Forms.Label
$hintLbl.Text = "Astuce : fermer cette fenêtre (X) réduit l'app dans la barre des tâches sans couper le serveur."
$hintLbl.ForeColor = $fgMuted
$hintLbl.Location = New-Object System.Drawing.Point(20, 444)
$hintLbl.Anchor = "Bottom,Left"
$hintLbl.AutoSize = $true
$form.Controls.Add($hintLbl)

function Invoke-AdminPost($endpoint, $bodyObj) {
  try {
    $json = $bodyObj | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri ("http://127.0.0.1:3000" + $endpoint) -ContentType "application/json; charset=utf-8" -Body $json -TimeoutSec 2 | Out-Null
    Refresh-Dashboard
  } catch {
    [System.Windows.Forms.MessageBox]::Show(
      "Impossible d'exécuter l'action d'administration.",
      "Coilball — Modération",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    ) | Out-Null
  }
}

$btnCloseRoom.Add_Click({
  $code = $roomCombo.Text.Trim().ToUpper()
  if (-not $code) { return }
  $confirm = [System.Windows.Forms.MessageBox]::Show(
    "Fermer de force le salon $code et déconnecter ses joueurs ?",
    "Coilball — Fermer un salon",
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Warning
  )
  if ($confirm -eq [System.Windows.Forms.DialogResult]::Yes) {
    Invoke-AdminPost "/admin/close-room" @{ code = $code }
  }
})

$btnBanIp.Add_Click({
  $ip = $ipCombo.Text.Trim()
  if (-not $ip) { return }
  $confirm = [System.Windows.Forms.MessageBox]::Show(
    "Bannir l'adresse IP $ip et couper immédiatement ses connexions ?",
    "Coilball — Bannir une IP",
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Warning
  )
  if ($confirm -eq [System.Windows.Forms.DialogResult]::Yes) {
    Invoke-AdminPost "/admin/ban-ip" @{ ip = $ip }
  }
})

$btnUnbanIp.Add_Click({
  $ip = $ipCombo.Text.Trim()
  if (-not $ip) { return }
  Invoke-AdminPost "/admin/unban-ip" @{ ip = $ip }
})

function Show-AppWindow {
  if (-not $form.Visible) { $form.Show() }
  if ($form.WindowState -eq [System.Windows.Forms.FormWindowState]::Minimized) {
    $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
  }
  $form.Activate()
  $form.BringToFront()
  Refresh-Dashboard
}

function Refresh-Dashboard {
  $isAlive = ($script:nodeProc -and -not $script:nodeProc.HasExited)
  $btnStart.Enabled = (-not $isAlive)
  $btnStop.Enabled = $isAlive
  $btnRestart.Enabled = $isAlive

  if (-not $isAlive) {
    $statusLbl.Text = "● Arrêté"
    $statusLbl.ForeColor = $accentRed
    $script:notifyIcon.Text = "Coilball Serveur — Arrêté"
    $summaryLbl.Text = "Salons actifs : 0   |   Joueurs connectés : 0"
    if ($form.Visible) {
      $roomsBox.Text = "Le serveur est arrêté.`r`nCliquez sur « Démarrer » pour le remettre en ligne."
    }
    return
  }

  if (-not $form.Visible) {
    $script:notifyIcon.Text = "Coilball Serveur — En ligne (port 3000)"
    return
  }

  try {
    $data = Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -TimeoutSec 2
    $statusLbl.Text = "● En ligne (port 3000) — Temps actif : $($data.uptimeSec) s"
    $statusLbl.ForeColor = $accentGreen
    $script:notifyIcon.Text = "Coilball — En ligne ($($data.rooms) salon(s), $($data.players) joueur(s))"
    $summaryLbl.Text = "Salons actifs : $($data.rooms)   |   Joueurs connectés : $($data.players)"

    $lines = New-Object System.Collections.Generic.List[string]
    $roomCodes = New-Object System.Collections.Generic.List[string]
    $ipSet = New-Object System.Collections.Generic.HashSet[string]

    if ($data.roomList -and $data.roomList.Count -gt 0) {
      foreach ($room in $data.roomList) {
        [void]$roomCodes.Add([string]$room.code)
        if ($room.hostIp) { [void]$ipSet.Add([string]$room.hostIp) }
        $lines.Add("Salon $($room.code)  ($($room.playerCount)/6 joueurs)")
        $lines.Add("  Créé par (Hôte) : $($room.hostName) [$($room.hostPeerId)]  IP: $($room.hostIp)")
        if ($room.clients -and $room.clients.Count -gt 0) {
          foreach ($c in $room.clients) {
            if ($c.ip) { [void]$ipSet.Add([string]$c.ip) }
            $lines.Add("  Client          : $($c.name) [$($c.peerId)]  IP: $($c.ip)")
          }
        } else {
          $lines.Add("  Client          : (en attente d'autres joueurs)")
        }
        $lines.Add("")
      }
    } else {
      $lines.Add("Aucun salon actif pour le moment.")
      $lines.Add("")
      $lines.Add("Actualisation automatique toutes les 1,5 secondes...")
    }

    if ($data.bannedIps -and $data.bannedIps.Count -gt 0) {
      $lines.Add("")
      $lines.Add("IPs bannies : " + ($data.bannedIps -join ", "))
      foreach ($bip in $data.bannedIps) { [void]$ipSet.Add([string]$bip) }
    }

    if (-not $roomCombo.DroppedDown) {
      $curRoom = $roomCombo.Text
      $roomCombo.Items.Clear()
      foreach ($rc in $roomCodes) { [void]$roomCombo.Items.Add($rc) }
      if (-not $curRoom -and $roomCodes.Count -gt 0) { $roomCombo.Text = $roomCodes[0] }
    }
    if (-not $ipCombo.DroppedDown) {
      $curIp = $ipCombo.Text
      $ipCombo.Items.Clear()
      foreach ($ipVal in $ipSet) { [void]$ipCombo.Items.Add($ipVal) }
      if (-not $curIp -and $ipSet.Count -gt 0) {
        foreach ($firstIp in $ipSet) { $ipCombo.Text = $firstIp; break }
      }
    }
    $nextText = ($lines -join "`r`n")
    if ($roomsBox.Text -ne $nextText) {
      $roomsBox.Text = $nextText
    }
  } catch {
    $statusLbl.Text = "● En ligne (démarrage HTTP...)"
    $statusLbl.ForeColor = $accentAmber
  }
}

function Quit-Application {
  $script:quitting = $true
  if ($script:timer) { $script:timer.Stop() }
  Stop-NodeServer
  Remove-Item -Path $TrayPidFile -ErrorAction SilentlyContinue
  if ($script:notifyIcon) {
    $script:notifyIcon.Visible = $false
    $script:notifyIcon.Dispose()
  }
  $form.Close()
  [System.Windows.Forms.Application]::Exit()
}

$btnStart.Add_Click({ Start-NodeServer; Refresh-Dashboard })
$btnStop.Add_Click({ Stop-NodeServer; Refresh-Dashboard })
$btnRestart.Add_Click({ Stop-NodeServer; Start-Sleep -Milliseconds 200; Start-NodeServer; Refresh-Dashboard })
$btnHealth.Add_Click({ Start-Process "https://symphonia.tail69ad79.ts.net/health" })
$btnLogs.Add_Click({
  if (-not (Test-Path $LogFile)) { New-Item -Path $LogFile -ItemType File -Force | Out-Null }
  Start-Process "notepad.exe" -ArgumentList "`"$LogFile`""
})
$btnQuit.Add_Click({ Quit-Application })

$form.Add_FormClosing({
  param($sender, $e)
  if (-not $script:quitting) {
    $e.Cancel = $true
    $form.Hide()
  }
})

# --- Icône dans la barre des tâches (System Tray) ---
$script:notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$script:notifyIcon.Icon = $script:appIcon
$script:notifyIcon.Text = "Coilball Serveur — En ligne (port 3000)"
$script:notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$openItem = $menu.Items.Add("Ouvrir l'application")
$openItem.Add_Click({ Show-AppWindow })
$toggleItem = $menu.Items.Add("Démarrer / Arrêter le serveur")
$toggleItem.Add_Click({
  if ($script:nodeProc -and -not $script:nodeProc.HasExited) { Stop-NodeServer } else { Start-NodeServer }
  Refresh-Dashboard
})
$menu.Items.Add("-") | Out-Null
$quitItem = $menu.Items.Add("Quitter l'application")
$quitItem.Add_Click({ Quit-Application })
$script:notifyIcon.ContextMenuStrip = $menu
$script:notifyIcon.Add_MouseClick({
  param($s, $e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Show-AppWindow }
})

# --- Boucle de surveillance + auto-actualisation ---
$script:timer = New-Object System.Windows.Forms.Timer
$script:timer.Interval = 1500
$script:timer.Add_Tick({
  if ($script:quitting) { return }
  if ($script:showEvent.WaitOne(0)) {
    Show-AppWindow
  }
  if ($script:wantRunning -and (-not $script:nodeProc -or $script:nodeProc.HasExited)) {
    Start-NodeServer
  }
  Refresh-Dashboard
})

Start-NodeServer
$script:timer.Start()
Refresh-Dashboard

[System.Windows.Forms.Application]::Run($form)
