$groups = @(
    @("3-temple", "4-nursing-entrance-1"),
    @("5-engineering-main-entrance-1", "6-engineering-main-stage-"),
    @("7-office_entrance-", "8-principal_cabin"),
    @("9-office_inside", "10-office2"),
    @("11-first_floor_steps", "12-first_floor"),
    @("13-physics_lab", "14-cse_lab"),
    @("15-2nd_floor", "16-ethno-right"),
    @("17-ethno-left", "18-3rd_floor"),
    @("19-nexus", "20-aids_out"),
    @("21-aids_in", "22-4th_floor"),
    @("23-wrkube", "24-csbs_out", "25-auditorium")
)

$i = 1
foreach ($grp in $groups) {
    Write-Host "=== Pushing Batch $i of $($groups.Count): $($grp -join ', ') ==="
    foreach ($scene in $grp) {
        git add "app-files/tiles/$scene"
    }
    git commit -m "Add scenes: $($grp -join ', ')"
    $pushed = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        Write-Host "Push attempt $attempt..."
        git push origin deploy:main
        if ($LASTEXITCODE -eq 0) {
            $pushed = $true
            break
        }
        Write-Host "Retrying in 4 seconds..."
        Start-Sleep -Seconds 4
    }
    if (-not $pushed) {
        Write-Error "Failed to push batch: $($grp -join ', ')"
        exit 1
    }
    $i++
}

Write-Host "=== ALL 26 SCENES SUCCESSFULLY PUSHED TO GITHUB! ==="
