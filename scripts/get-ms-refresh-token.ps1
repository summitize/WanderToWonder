param(
    [Parameter(Mandatory = $true)]
    [string]$ClientId,

    [string]$Tenant = "consumers",
    [string]$Scope = "Files.Read offline_access"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-ErrorResponseBody {
    param([System.Exception]$Exception)

    try {
        if ($Exception.Response -and $Exception.Response.GetResponseStream()) {
            $reader = New-Object System.IO.StreamReader($Exception.Response.GetResponseStream())
            return $reader.ReadToEnd()
        }
    } catch {
        return ""
    }

    return ""
}

$deviceCodeUri = "https://login.microsoftonline.com/$Tenant/oauth2/v2.0/devicecode"
$tokenUri = "https://login.microsoftonline.com/$Tenant/oauth2/v2.0/token"

Write-Host "Requesting device code..." -ForegroundColor Cyan
$deviceResponse = Invoke-RestMethod -Method Post -Uri $deviceCodeUri -Body @{
    client_id = $ClientId
    scope     = $Scope
}

Write-Host ""
Write-Host $deviceResponse.message -ForegroundColor Yellow
Write-Host ""

$interval = [int]$deviceResponse.interval
if ($interval -lt 2) { $interval = 5 }

$deadline = (Get-Date).AddSeconds([int]$deviceResponse.expires_in)

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds $interval

    try {
        $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenUri -Body @{
            grant_type  = "urn:ietf:params:oauth:grant-type:device_code"
            client_id   = $ClientId
            device_code = $deviceResponse.device_code
        }

        if (-not $tokenResponse.refresh_token) {
            throw "Token response did not include refresh_token. Confirm scope includes offline_access."
        }

        Write-Host "Success. Save this refresh token securely:" -ForegroundColor Green
        Write-Host ""
        Write-Output $tokenResponse.refresh_token
        Write-Host ""
        Write-Host "Also returned access token expiry: $($tokenResponse.expires_in) seconds" -ForegroundColor Gray
        exit 0
    }
    catch {
        $rawBody = Read-ErrorResponseBody -Exception $_.Exception
        $errorCode = ""

        if ($rawBody) {
            try {
                $parsed = $rawBody | ConvertFrom-Json
                $errorCode = [string]$parsed.error
            } catch {
                $errorCode = ""
            }
        }

        if ($errorCode -eq "authorization_pending") {
            continue
        }

        if ($errorCode -eq "slow_down") {
            $interval += 5
            continue
        }

        if ($errorCode -eq "expired_token") {
            throw "Device code expired. Re-run this script."
        }

        if ($rawBody) {
            throw "Token polling failed: $rawBody"
        }

        throw $_
    }
}

throw "Timed out waiting for device login approval. Re-run and complete sign-in sooner."
