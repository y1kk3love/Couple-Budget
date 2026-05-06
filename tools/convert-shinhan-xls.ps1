# ================================================================
# convert-shinhan-xls.ps1
# 신한카드 .xls 명세서를 csvModal.js가 읽을 수 있는 EUC-KR CSV로 변환.
# excel/*.xls를 모두 읽어 거래일자 기준 YYYY-MM별로 그룹핑하여
# excel/converted/<YYYY-MM>.csv로 출력. 신용카드 거래는 모두 지출.
# 취소상태 컬럼이 비어있지 않은 행은 제외.
# 카테고리는 업종 + 가맹점 키워드 휴리스틱으로 자동 분류, 미매칭은 "기타".
# ================================================================

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
  $ProjectRoot = 'C:\Users\jongj\Documents\Gits\Couple-Budget'
} else {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}
$XlsDir = Join-Path $ProjectRoot 'excel'
$OutDir = Join-Path $XlsDir 'converted'

function Get-Cat($industry, $merchant) {
  # 주거 (공과금) — 가맹점 우선
  if ($merchant -match '도시가스|관리비|한국전력|^03전기\d+|^한전') { return '주거' }

  # 식비
  if ($industry -match '할인점|슈퍼마켓|한식|중식|일식|양식|분식|카페|커피전문점|제과|제빵|뷔페|패스트푸드|음료|주류|편의점|도시락|치킨|피자|족발|보쌈|곱창|닭갈비|샤브|구이|찜|국수|쌀국수|찌개|탕|일반대중음식|농가공산품') { return '식비' }
  if ($merchant -match '스타벅스|투썸|이디야|메가커피|메가엠지씨|컴포즈|할리스|폴바셋|빽다방|팀홀튼|GS25|CU|세븐일레븐|이마트24|배달의민족|배민|요기요|쿠팡이츠|마켓컬리|쓱배송|이마트|홈플러스|SSG|롯데마트|코스트코|트레이더스|GS더프레시|지에스더프레시|서브웨이|맥도날드|버거킹|롯데리아|KFC|우아한형제들|신전떡볶이|씨제이제일제당|CJ제일제당|미푸드시스템') { return '식비' }

  # 의료/건강
  if ($industry -match '약국|의원|병원|치과|한의원|의료|건강|보건') { return '의료/건강' }

  # 교통
  if ($industry -match '주유|주차|대중교통|택시|항공|철도|고속도로|지하철|버스|렌터카|톨게이트') { return '교통' }
  if ($merchant -match '카카오T|카카오모빌리티|티머니|티맵|쏘카|그린카') { return '교통' }

  # 문화/여가
  if ($industry -match '영화|공연|호텔|숙박|게임|놀이|레저|관광|스포츠|체육|볼링|당구|노래|사진관') { return '문화/여가' }
  if ($merchant -match '마이리얼트립|야놀자|여기어때|놀유니버스|에어비앤비|CGV|메가박스|롯데시네마') { return '문화/여가' }

  # 미용
  if ($industry -match '미용|이용|네일|뷰티|마사지|피부') { return '미용' }
  if ($merchant -match '올리브영') { return '미용' }

  # 교육
  if ($industry -match '학원|교육|도서|서점|학습') { return '교육' }

  # 쇼핑
  if ($industry -match '의류|잡화|백화점|아울렛|문구|가구|전자|가전|생활용품|쇼핑몰') { return '쇼핑' }
  if ($merchant -match '쿠팡|11번가|G마켓|옥션|위메프|티몬|네이버쇼핑|네이버페이|아성다이소|다이소|무신사|29CM|Starfield|스타필드|오늘의집|버킷플레이스') { return '쇼핑' }

  # 구독 (통신, OTT 등)
  if ($industry -match '통신|인터넷|전화') { return '구독' }
  if ($merchant -match 'Disney|Netflix|넷플릭스|Spotify|YouTube|유튜브|왓챠|티빙|쿠팡플레이|밀리의서재|리디|Apple|Google Play|애플|구글') { return '구독' }

  return '기타'
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$rows = New-Object System.Collections.ArrayList

$xlsFiles = Get-ChildItem (Join-Path $XlsDir '*.xls')
foreach ($file in $xlsFiles) {
  $wb = $excel.Workbooks.Open($file.FullName)
  $ws = $wb.Worksheets.Item(1)
  $used = $ws.UsedRange
  $rowCount = $used.Rows.Count

  for ($r = 2; $r -le $rowCount; $r++) {
    $date = $ws.Cells.Item($r, 1).Text
    $merchant = $ws.Cells.Item($r, 5).Text
    $industry = $ws.Cells.Item($r, 6).Text
    $amount = $ws.Cells.Item($r, 7).Text
    $cancel = $ws.Cells.Item($r, 11).Text

    if ([string]::IsNullOrWhiteSpace($amount)) { continue }
    if (-not [string]::IsNullOrWhiteSpace($cancel)) { continue }

    $dateNorm = $date -replace '\.', '-'
    if ($dateNorm.Length -lt 7) { continue }
    $amountNum = ($amount -replace '[^0-9]', '')
    $merchantClean = ($merchant -replace ',', ' ').Trim()
    $cat = Get-Cat $industry $merchantClean
    $ym = $dateNorm.Substring(0, 7)

    [void]$rows.Add([PSCustomObject]@{
      Date = $dateNorm
      Merchant = $merchantClean
      Industry = $industry
      Amount = $amountNum
      Type = '지출'
      Category = $cat
      YearMonth = $ym
    })
  }

  $wb.Close($false)
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ws) | Out-Null
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null
}

$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$enc = [System.Text.Encoding]::GetEncoding('euc-kr')

$groups = $rows | Group-Object YearMonth | Sort-Object Name
foreach ($g in $groups) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('날짜,가맹점,금액,구분,카테고리')
  $sorted = $g.Group | Sort-Object Date -Descending
  foreach ($row in $sorted) {
    [void]$sb.AppendLine("$($row.Date),$($row.Merchant),$($row.Amount),$($row.Type),$($row.Category)")
  }
  $outPath = Join-Path $OutDir ("$($g.Name).csv")
  [System.IO.File]::WriteAllText($outPath, $sb.ToString(), $enc)
}

"=== 변환 완료 ==="
"총 거래: $($rows.Count)건"
""
"--- 월별 출력 ---"
foreach ($g in $groups) {
  $totalAmt = ($g.Group | Measure-Object -Property Amount -Sum).Sum
  "$($g.Name): $($g.Count)건, 합계 $('{0:N0}' -f [int64]$totalAmt)원 -> excel/converted/$($g.Name).csv"
}
""
"--- 카테고리별 ---"
$rows | Group-Object Category | Sort-Object Count -Descending | ForEach-Object {
  $sum = ($_.Group | Measure-Object -Property Amount -Sum).Sum
  "$($_.Name): $($_.Count)건, $('{0:N0}' -f [int64]$sum)원"
}
""
"--- '기타' 분류 (수동 점검 후보) ---"
$etc = $rows | Where-Object { $_.Category -eq '기타' }
if ($etc.Count -eq 0) { "(없음)" } else {
  $etc | Select-Object Date, Merchant, Industry, Amount | Format-Table -AutoSize | Out-String
}
