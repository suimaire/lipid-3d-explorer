# 지질의 생화학 3D 탐색기 (Lipid 3D Explorer)

HAFS 생화학 특강용 인터랙티브 학습 페이지. 세포막 지질의 **종류와 비대칭성**, **PIP2 신호전달**,
**지방산 β-산화**를 3D 모델과 단계별 애니메이션으로 탐구합니다.

공개 주소: <https://suimaire.github.io/lipid-3d-explorer/>
수업 포털: <https://suimaire.github.io/>

## 기술 스택

- 순수 정적 사이트 — HTML + CSS + ES 모듈 자바스크립트
- [Three.js](https://threejs.org/) r170 (`assets/vendor/three.module.min.js` 에 **로컬 포함**)
- **빌드 도구 없음, 패키지 설치 없음, 백엔드·외부 API 없음, CDN 호출 없음**
- 첫 로드 이후에는 인터넷 없이도 동작합니다(브라우저 캐시 기준)

카메라 조작(드래그 회전 · 휠 확대)과 3D 좌표에 붙는 HTML 라벨 오버레이는 `scripts/core/viewer.js`에
직접 구현했습니다. OrbitControls 등 추가 의존성은 쓰지 않습니다.

## 모듈 1의 관찰 스케일

**세포 전체 ⇄ 세포 내부 ⇄ 막 확대 ⇄ 개별 지질**의 네 공간 스케일을 탐색하고,
개별 지질에서는 원자 단위 3D 모델과 2D 구조식을 번갈아 봅니다.
첫 화면은 닫힌 세포막이며, [단면 보기]는 앞쪽 지질을 실제 렌더 목록에서 제외해 두 leaflet과
세포질을 드러냅니다. [세포 내부]는 **응용 예시 · 골격근 섬유**의 별도 장면으로 전환합니다.
구형 모델이 근육세포로 변형되는 과정이 아닙니다. 내부 장면의 [막 확대]는 sarcolemma의
특정 표면에 접근한 뒤 기존 지질 이중층 조각에 연결됩니다.
`prefers-reduced-motion`에서는 카메라의 스케일 전환을 즉시 처리합니다.

- `scripts/core/whole-cell.js`: 두 반지름의 Fibonacci sphere, 법선 방향 지질 배치,
  geometry별 4개 InstancedMesh, 단면과 PS 상태. 기존 `buildLipid`의 부품·색을 재사용합니다.
- `scripts/core/membrane-composition.js`: 막 조각과 세포 전체가 공유하는 조성, seeded shuffle.
- `scripts/core/cell-interior.js`: 길쭉한 근섬유의 longitudinal cutaway, sarcolemma/T-tubule,
  별도 SR network와 terminal cisternae, triad, NMJ, 평행한 myofibril과 공간 표지.
  첫 세포 내부 진입 때 생성하고 이후 같은 장면을 재사용합니다.
- `scripts/modules/membrane.js`: 공간 스케일과 내부 관찰 모드, 라벨, 초점 이동 및 기존 지질 선택을 연결합니다.
- 데스크톱은 인지질 4,304개 + 콜레스테롤 301개, 시작 시 680px 이하 또는 저메모리 장치에서는
  2,421개 + 169개입니다. 좁은 화면의 기호 폭을 넓혀 표면 밀도를 유지하고, 구의 면 수를 줄이며 픽셀 비율을 1.5로 제한합니다.
- 드래그/터치 회전, 휠/두 손가락 확대를 지원합니다. Reset은 현재 공간 스케일이나 선택한 분자의
  기본 프레이밍으로 돌아오며, 단면 상태와 사용자가 선택한 자동 회전·라벨 설정은 유지합니다.
- 모형의 두께·분자 크기·조성은 학습용으로 과장했습니다. 구형 장면은 닫힌 이중층의 개념 모형이며,
  세포 내부 장면은 골격근의 막 구획화 예시입니다. 실제 분자 동역학은 계산하지 않습니다.

### 세포 내부 · 골격근 섬유

불투명한 근섬유 외피의 일부를 길이 방향으로 제거해 내부를 관찰합니다. Sarcolemma와 T-tubule은
같은 계열의 색으로 이어지고, T-tubule의 열린 lumen에는 세포 바깥쪽과 같은 물 표지를 둡니다.
T-tubule도 일부를 관찰용으로 절개해 lumen을 드러냅니다. 이 절개와 표본 경계의 잘린 관 끝은
실제 관이 cytosol로 열려 있거나 세포 안에서 자유롭게 끝난다는 뜻이 아닙니다.
별도 색의 SR은 myofibril 주위를 감싸며, triad에서는 **SR 종말수조 — 틈 — T-tubule — 틈 — SR 종말수조**가
보입니다. NMJ는 근섬유 표면에 있고 대표 triad와 길이 방향으로 떨어져 있습니다.

- **전체 구조**: 여러 myofibril 사이에 T-tubule과 SR이 놓인 넓은 3/4 cutaway.
- **막 연결성**: A(세포외 공간과 연속된 T-tubule lumen / sarcolemma와 연속된 T-tubule membrane),
  B(별도 SR 구획), C(cytosol)를 구분합니다. 막과 수용성 공간 자체가 같은 물질이라는 뜻은 아닙니다.
- **흥분 전달**: NMJ → sarcolemma를 따라 전파 → T-tubule → triad → SR Ca²⁺ 방출 순서를 강조합니다.
  표면을 따라가는 띠와 T소관 벽의 고리로 전파를 표시하고 약 6초 뒤 강조를 종료합니다.
  신호의 위치와 순서를 설명하는 도식이며, 빛이나 입자가 전기 신호의 실체라는 뜻은 아닙니다.
  외부와 내강의 물 표지는 이 신호와 독립된 고정 표지입니다.
- **Triad 확대**, **NMJ**, **T-tubule**, **SR**: 해당 부위로 카메라를 이동합니다.
  기존 회전·확대·자동 회전·Reset·라벨 토글을 함께 사용합니다.
- Myofibril과 반복되는 막 구간·표지는 `InstancedMesh` 또는 하나로 합친 geometry로 묶습니다.
  막 두께, 관 지름, SR 크기, myofibril 간격, NMJ 거리와 전체 상대 비율은 관찰을 위해 과장합니다.
  Actin/myosin 개별 filament, 정량적인 이온 이동·수축·혈류는 이 장면의 범위에 포함하지 않습니다.

내부 장면의 구현 수치는 다음과 같습니다. 길이와 간격은 모두 교육용 모형 단위입니다.

| 항목 | 구현 |
| --- | --- |
| 근섬유 | 길이 34 · 지름 14, 외피 둘레 약 33.9%를 길이 방향으로 제거 |
| Sarcolemma → T-tubule | 하나의 indexed mesh. 외피의 실제 관 입구와 안팎 경계 고리의 정점을 공유하며, 입구를 막는 cap 없음 |
| Myofibril | 6개를 평행 배치 |
| SR | Desktop 972 / compact 780개 구간을 하나의 `InstancedMesh`로 묶고 종말수조와 연결 |
| Triad / NMJ | 접합 틈 0.34, NMJ와 대표 triad의 길이 방향 간격 14.5 |
| 반복 geometry | 10개 instance batch, 전체 mesh 18개(평소 숨긴 흥분 전달용 강조 mesh 2개 포함) |

검증:

```bash
node scripts/qa/check-cell.mjs
node scripts/qa/check-interior.mjs
node scripts/qa/check-molecules.mjs
```

`check-cell`은 실제 인스턴스 행렬의 head/tail 방향, 극지방 밀도, 지질 간격, 콜레스테롤 위치,
PS 이동 시 총량 보존, PIP2 위치, 단면 제거, 재현성, 버퍼 재사용, pinch/회전/확대 제한을 확인합니다.
`check-interior`는 내부 장면의 공간 관계와 반복 geometry를 점검합니다. 자동 점검과 별도로 브라우저에서
다음 장면을 확인합니다. 이는 재검증 절차이며 특정 장치의 실행 결과나 성능 보증이 아닙니다.

| 화면 | 확인할 장면 |
| --- | --- |
| 데스크톱 | 기본 cutaway, 회전 후, 막 연결성, NMJ, 표면에서 이어지는 T-tubule, SR network, Triad 확대, 막 확대 전환 |
| 모바일 390px | 기본 내부 장면, Triad 확대, 조작 버튼의 줄바꿈·가로 넘침·라벨 가독성 |
| 기존 기능 | Whole Cell/단면, 막 조각·비대칭성·PS 노출, 지질 선택·3D/2D, Reset, 회전·pinch·라벨 |

시각 점검에서는 T-tubule과 sarcolemma가 이어져 보이는지, T-tubule lumen과 cytosol이 구별되는지,
SR과 T-tubule 사이의 틈, myofibril 주변 SR, NMJ와 triad의 분리, 내부 공간의 가독성을 확인합니다.
로컬 주소에 `?qa`를 붙이면 페이지 아래에 실제 프레임 간격과 draw call을 표시하는 진단 패널이 생깁니다.
이 패널은 공개 사이트에서는 로드하지 않습니다. 측정된 FPS는 실행 장치·브라우저의 값이며 휴대폰 성능을 보증하지 않습니다.

### 개발자용 브라우저 QA (선택)

정적 서버를 켠 뒤, **이미 Playwright와 Chrome을 사용할 수 있는 개발 환경**에서 다음을 실행합니다.
앱 자체와 일반 사용자는 패키지 설치가 필요 없습니다. 이 도구는 데스크톱·390px 화면을 캡처하고
스케일 전환, 기존 지질 기능, 터치/확대, reduced-motion 및 가로 넘침을 점검합니다.

```bash
node scripts/qa/check-interior-browser.mjs
```

| 환경 변수 | 지정할 값 / 기본 동작 |
| --- | --- |
| `PLAYWRIGHT_MODULE` | 기존 Playwright `index.mjs`의 절대 경로. 생략하면 `playwright` 패키지 탐색 |
| `CHROME_PATH` | Chrome 실행 파일 경로. 생략하면 설치된 Chrome 채널 사용 |
| `QA_URL` | 점검할 로컬 페이지. 기본 `http://127.0.0.1:4173/?qa` |
| `QA_OUT` | 캡처·보고서 저장 폴더. 기본 시스템 임시 폴더 아래 `lipid-interior-qa` |

PowerShell에서 경로를 바꾸는 예시입니다. 설치된 도구의 실제 경로로 바꿔 사용합니다.

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\tools\playwright\index.mjs'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:QA_URL = 'http://127.0.0.1:4173/?qa'
$env:QA_OUT = Join-Path $env:TEMP 'lipid-interior-qa'
node scripts/qa/check-interior-browser.mjs
```

## 파일 구조

```
lipid-3d-explorer/
├─ index.html                     페이지 전체(3개 모듈의 마크업과 설명 패널)
├─ styles/
│  └─ app.css                     흰 배경 · 짙은 회색 텍스트 · 파란색 강조 톤
├─ scripts/
│  ├─ main.js                     탭 전환과 렌더 루프(보이는 모듈만 그림)
│  ├─ core/
│  │  ├─ viewer.js                Three.js 래퍼: 렌더러 · 라이팅 · 궤도 카메라 · 라벨 · 피킹
│  │  ├─ lipids.js                지질 데이터표 + 막에 쓰는 도식 지질 모델 빌더
│  │  ├─ membrane-composition.js  막 조각·세포 전체가 공유하는 leaflet 조성
│  │  ├─ whole-cell.js            구형 이중층의 분포·방향·인스턴싱·단면·PS 상태
│  │  ├─ cell-interior.js         골격근 내부 cutaway·막 연결성·SR·triad·NMJ
│  │  ├─ molecules.js             원자 단위 지질 구조 좌표 생성기 (three.js 의존 없음)
│  │  ├─ atomistic.js             원자 단위 구조를 ball-and-stick 3D 로 굽는다 (LEVEL 1)
│  │  └─ structures.js            지질 2D 화학 구조식 SVG (LEVEL 2)
│  ├─ qa/
│  │  ├─ check-molecules.mjs      원자 단위 구조 자체 점검 (node 로 실행)
│  │  ├─ check-cell.mjs           구형 이중층·조작기의 자동 점검
│  │  ├─ check-interior.mjs       근섬유 막 구조·구획·인스턴싱 자동 점검
│  │  ├─ check-interior-browser.mjs  선택적 Playwright·Chrome 화면 캡처와 회귀 점검
│  │  └─ browser-metrics.js       로컬 ?qa 환경에서만 프레임 간격·draw call 측정
│  └─ modules/
│     ├─ membrane.js              모듈 1 — 세포막 지질과 막 비대칭성
│     ├─ pip2.js                  모듈 2 — PIP2 신호전달 (단계 목록 UI 공용 함수 포함)
│     ├─ pip2-vasopressin.js      모듈 2 확장 — 바소프레신 V1a → 혈관 평활근 수축
│     └─ beta-oxidation.js        모듈 3 — 지방산 β-산화
├─ assets/
│  ├─ vendor/three.module.min.js  Three.js r170 (MIT)
│  └─ favicon.svg
├─ docs/
│  └─ SCIENTIFIC_NOTES.md         교육용 단순화 내용과 근거 정리
├─ .github/workflows/deploy.yml   GitHub Pages 배포(빌드 없음)
└─ .nojekyll
```

3D 모델은 외부 파일(GLTF/OBJ/PDB 등)을 쓰지 않고 **코드에서 절차적으로 생성**합니다.
원자 단위 구조도 표준 결합 길이·결합각·이면각으로 좌표를 직접 계산합니다.
따라서 내려받을 asset이 없고, 사슬 길이·지질 조성 같은 값을 상수만 고쳐 바꿀 수 있습니다.

원자 단위 구조가 어떤 대표 분자인지는 [`docs/SCIENTIFIC_NOTES.md`](docs/SCIENTIFIC_NOTES.md) 에
정리했습니다. 구조 좌표는 다음 명령으로 점검할 수 있습니다(브라우저 없이 Node.js 만 있으면 됩니다).

```bash
node scripts/qa/check-molecules.mjs
```

## 로컬에서 실행하기

ES 모듈을 쓰므로 `index.html`을 더블클릭(`file://`)하면 동작하지 않습니다. 정적 서버가 필요합니다.

Python이 있다면:

```bash
python -m http.server 4173
```

Node.js가 있다면:

```bash
npx --yes serve -l 4173 .
```

그다음 브라우저에서 <http://127.0.0.1:4173/> 을 엽니다.

## GitHub Pages 배포

이 폴더는 그 자체로 완성된 배포본입니다. 별도 빌드 단계가 없습니다.

1. GitHub에 `suimaire/lipid-3d-explorer` 저장소를 만듭니다.
2. 이 폴더에서:

```bash
git remote add origin https://github.com/suimaire/lipid-3d-explorer.git
git push -u origin main
```

3. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 지정합니다.
   `.github/workflows/deploy.yml`이 `main`에 푸시될 때마다 저장소 전체를 Pages로 올립니다.

경로는 모두 `./`로 시작하는 상대경로라 `https://suimaire.github.io/lipid-3d-explorer/`
하위 경로에서도 그대로 동작합니다.

> Source를 **Deploy from a branch**로 두어도 동작합니다. 그 경우 `.nojekyll` 파일이 있어야
> `_`로 시작하는 경로가 무시되지 않습니다(이미 포함돼 있습니다).

## 모듈 구성

### 모듈 1 — 세포막 지질과 막 비대칭성

> 세포막은 똑같은 인지질이 죽 늘어선 막일까, 아니면 여러 종류의 지질이 서로 다른 쪽에 배치된 구조일까?

- **전체 막 보기** — 지질 이중층 전체. outer/inner leaflet 라벨, 콜레스테롤 삽입
- **세포 내부 보기** — 골격근 섬유의 sarcolemma, T-tubule, SR, triad와 NMJ를 탐색하는 응용 예시
- **지질 종류 보기** — 7종을 2.4초 간격으로 하나씩 강조(나머지는 회색 처리)
- **막 비대칭성 보기** — 두 leaflet을 위아래로 벌려 조성 비교
- **PS 외부 노출 보기** — 안쪽 PS 일부가 호를 그리며 바깥층으로 이동
- **원자 단위 3D 구조**(막에서 지질 클릭 또는 범례 클릭) — ball-and-stick 모델 + 부위별 라벨 +
  대표 분자 정보 카드. 여기서 **[2D 구조식 보기]** 로 같은 분자의 화학 구조식과 번갈아 볼 수 있습니다.
- 라벨 표시 / 자동 회전 토글, Reset (현재 공간 스케일 또는 선택한 분자의 기본 시점으로 돌아갑니다)

수록 지질: PC · PE · PS · PI · PIP2 · SM · 콜레스테롤

네 공간 스케일 가운데 개별 지질에 들어가는 표현 단계는 다음과 같습니다.

| 단계 | 화면 | 다음 단계로 | 캔버스 클릭 |
| --- | --- | --- | --- |
| LEVEL 0 `membrane` | 전체 세포막(도식 모델) | 지질 하나를 클릭 | 막을 이루는 지질들 |
| LEVEL 1 `atomistic3D` | 그 지질의 **원자 단위 3D 구조** | [2D 구조식 보기] | 없음 — 드래그 회전 · 휠 확대만 |
| LEVEL 2 `structure2D` | 같은 지질의 **2D 화학 구조식**(SVG) | [3D 구조 보기] | 없음 — 휠 확대 · 드래그 이동만 |

3D ↔ 2D 를 오가도 **선택한 지질은 그대로 유지**됩니다. 확대 단계에서는 `viewer.setPickables([])` 로
클릭 대상을 비워 두기 때문에, 화면을 눌러도 뒤에 숨은 다른 지질이 선택되는 일이 없습니다.
전체 막은 지질이 수백 개라 도식 모델로 두고 **선택한 한 분자만 원자 단위로** 그립니다(계층형 abstraction).

### 모듈 2 — 세포막 인지질과 PIP2 신호전달

> PIP2 하나가 잘리면 왜 서로 다른 두 신호 분자가 생기고, 왜 하나는 막에 남고 하나는 세포질로 퍼질까?

이 모듈은 같은 3D 장면을 두 가지 **학습 모드**로 나누어 씁니다. 화면의 조작 줄에 현재 모드가 항상
표시되므로, 학생이 "지금 PIP2 구조를 보는 중인지, 실제 수용체 신호전달 예시를 보는 중인지" 헷갈리지 않습니다.

**① PIP2 핵심 과정 (기본, 7단계)**

PIP2 위치 → PLC 결합 → 절단 → DAG/IP3 분리 → IP3 수용체 결합 → Ca²⁺ 방출 → PKC 활성화

- **재생 / 일시정지**, 이전 단계 · 다음 단계, 단계 목록 직접 선택
- 바로가기: PIP2 위치 보기 · PLC 작용 · 절단 애니메이션 재생 · **DAG / IP3 비교**(비교표) · Ca²⁺ 방출 보기
- 라벨 표시 토글, Reset

**② 생리학적 확장 — Vasopressin V1a → 혈관 평활근 수축 (13단계)**

7단계를 끝까지 보면 **[생리학적 확장 보기]** 버튼이 나타나고, 누르면 신호를 **처음부터 다시**
연결해서 보여 줍니다. 수용체와 G 단백질은 PLC보다 상류이므로 7단계 뒤에 덧붙이지 않습니다.

vasopressin → V1a 수용체(GPCR) → Gq/11 → PLCβ → PIP2 → IP3 + DAG → IP3 수용체 → ER Ca²⁺ 방출
→ (병렬로 DAG + Ca²⁺ → PKC) → Ca²⁺–칼모듈린 → MLCK → 미오신 조절 경쇄 인산화 → 평활근 수축

- 가운데 구간(PIP2 절단 ~ Ca²⁺ 방출 ~ PKC)은 **핵심 7단계의 3D 객체와 애니메이션을 그대로 재사용**합니다.
- 마지막 장면에서는 다시 넓게 물러나, ligand → receptor → 신호전달 → 2차 전령 → 단백질 활성화 →
  세포 반응이라는 계층을 3D 위치와 짧은 라벨만으로 한 번에 복습합니다.
- **[← PIP2 핵심 과정으로 돌아가기]** 로 언제든 기본 모드로 돌아옵니다. Reset도 확장 모드를 종료합니다.
- 설명 패널 아래에 **V1a와 V2를 구분하는 주의 박스**가 함께 표시됩니다. 신장 집합관의 V2 수용체는
  Gs–adenylyl cyclase–cAMP–PKA 경로로 AQP2 삽입을 촉진하는 **다른 경로**입니다.

**카메라와 재생 속도**

- **자동 재생**은 원형질막 · 세포질 · ER이 한 화면에 들어오는 overview 시점으로 약 1초에 걸쳐
  부드럽게 물러난 뒤, 재생 중에는 카메라를 더 움직이지 않습니다. 단계 강조는 라벨과 아주 작은
  scale 강조로만 합니다. 재생 중 직접 드래그·확대하면 그 시점을 존중하고 되돌리지 않습니다.
- **수동 탐색**(이전/다음/단계 선택)에서는 단계별로 가까운 시점을 그대로 씁니다.
- 재생 속도는 `scripts/modules/pip2.js` 의 `PIP2_TIMING` 한 곳에서 관리하며,
  한 단계 = `움직이는 시간 + 결과를 보는 시간` 으로 계산합니다(단계당 약 5.4~6.8초).

원형질막(위) · 세포질(가운데) · ER 막과 lumen(아래)이 한 장면에 있고, 각 영역을 아주 옅은 배경 띠와
라벨로 구분해 두어 위아래 방향이 헷갈리지 않습니다.

### 모듈 3 — 지방산 β-산화

> 지방산은 왜 2탄소씩 잘려 나가면서 acetyl-CoA를 만들까? 그리고 왜 하필 β 탄소일까?

한 cycle의 4단계: 산화(FAD→FADH₂) → 수화(H₂O) → 산화(NAD⁺→NADH) → 절단(thiolysis)

- **1 cycle 재생**, **반복 재생(C16 → 끝까지)**, 이전 단계 · 다음 단계
- **탄소 번호 보기**(C1/C2·α/C3·β/C4), **왜 β-산화인가**(β 탄소 확대 + 설명), **C16 예시 계산**
- 누적 카운터: cycle · acetyl-CoA · NADH · FADH₂ (C16은 7 / 8 / 7 / 7 로 끝납니다)
- Reset

장면 전체가 미토콘드리아 **기질(matrix)** 안쪽으로 표현돼 있어, 세포질에서 일어나는 것처럼 오해할 여지를 줄였습니다.

## 접근성 · 성능 메모

- 캔버스는 뷰포트 높이의 62%를 넘지 않아 조작 버튼이 화면 밖으로 밀려나지 않습니다.
- 캔버스 위에서 휠을 굴려도 **처음에는 페이지가 정상 스크롤**됩니다. 캔버스를 한 번 클릭(또는 Ctrl+휠)한
  뒤부터 확대/축소가 켜집니다.
- 라벨은 캔버스 밖으로 잘리지 않도록 가장자리에서 위치가 고정됩니다. 라벨 전체를 끌 수 있습니다.
- 자동 회전은 모듈 1에서만 켜집니다(모듈 2·3은 위아래 방향이 의미를 가지는 장면이라 꺼 둡니다).
  `prefers-reduced-motion` 환경에서는 자동 회전이 처음부터 꺼집니다.
- 모든 지오메트리는 저·중폴리곤이며 재질은 색상 단위로 캐시해 재사용합니다. 실제 프레임 속도는
  장치와 브라우저, 현재 장면에 따라 달라지며 로컬 `?qa` 패널에서 측정합니다.
- 원자 단위 모델은 구·원기둥 지오메트리 **하나**를 원소별 `InstancedMesh` 로 묶어 그립니다.
  분자 하나가 원자 28~65개인데도 draw call 은 10개 남짓이고, 한 번 만든 모델은 캐시해 재사용합니다.
  수소를 그리지 않아 원자 수가 3분의 1 수준으로 줄어드는 것도 성능에 도움이 됩니다.
- WebGL을 쓸 수 없으면 캔버스 자리에 안내 문구가 남고, 설명 패널·단계 버튼·지질 정보는 계속 동작합니다.

## 과학적 단순화

세부 내용은 [`docs/SCIENTIFIC_NOTES.md`](docs/SCIENTIFIC_NOTES.md)에 정리했습니다. 요약하면:

- 막 조성은 **동물 세포 원형질막의 대표적 경향**을 단순화한 것이며 고정 비율이 아닙니다.
- 세포 내부 장면은 **골격근 섬유의 막 구획화 예시**이며 모든 세포의 일반 구조가 아닙니다.
  T-tubule은 sarcolemma의 함입이고 lumen은 세포외 공간과 연속됩니다. SR은 별도의 막계입니다.
- 모듈 2의 핵심 7단계는 Gq–PLCβ 계열의 **대표적(canonical) 경로 예시**입니다. 아형과 세포 종류에 따라 달라집니다.
- 모듈 2의 확장은 **바소프레신이 V1a 수용체에 결합하는 경우**의 예시입니다. 바소프레신의 모든 작용이
  이 경로를 쓰는 것은 아니며, 신장 집합관의 V2 수용체는 Gs–cAMP–PKA 경로를 씁니다.
- 혈관 평활근 수축은 **Ca²⁺ → 칼모듈린 → MLCK → 미오신 경쇄 인산화** 축으로 그렸고,
  PKC는 직렬 상류 효소가 아니라 **병렬 가지**로 두었습니다.
- 모듈 3은 **짝수 탄소 포화 지방산(palmitate, C16)** 예시입니다.
- 지질 분자의 3D 모델은 원자 수준 구조가 아니라 머리·골격·꼬리를 구분해 보여 주는 도식 모델입니다.
- 화학 구조식(LEVEL 2)은 **class 수준의 일반화 구조**입니다. PC·PE·PS·PI·PIP2·SM은 지방산 사슬이
  서로 다를 수 있는 지질 그룹이므로 acyl chain을 `R₁` / `R₂`로 표기했습니다. 특정 지방산 하나를
  골라 그것이 그 지질의 유일한 구조인 것처럼 보이지 않게 했습니다.
- 구조식의 색은 3D 모델의 부위별 색과 맞춘 **학습용 구분**이며 화학적 표준 색이 아닙니다.

## 라이선스

수업 자료. `assets/vendor/three.module.min.js`는 Three.js(MIT License, © Three.js authors)입니다.
