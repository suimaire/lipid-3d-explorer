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
│  │  └─ lipids.js                지질 데이터표 + 지질 분자 3D 모델 빌더
│  └─ modules/
│     ├─ membrane.js              모듈 1 — 세포막 지질과 막 비대칭성
│     ├─ pip2.js                  모듈 2 — PIP2 신호전달 (단계 목록 UI 공용 함수 포함)
│     └─ beta-oxidation.js        모듈 3 — 지방산 β-산화
├─ assets/
│  ├─ vendor/three.module.min.js  Three.js r170 (MIT)
│  └─ favicon.svg
├─ docs/
│  └─ SCIENTIFIC_NOTES.md         교육용 단순화 내용과 근거 정리
├─ .github/workflows/deploy.yml   GitHub Pages 배포(빌드 없음)
└─ .nojekyll
```

3D 모델은 외부 파일(GLTF/OBJ 등)을 쓰지 않고 **코드에서 절차적으로 생성**합니다.
따라서 내려받을 asset이 없고, 사슬 길이·지질 조성 같은 값을 상수만 고쳐 바꿀 수 있습니다.

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
- **지질 종류 보기** — 7종을 2.4초 간격으로 하나씩 강조(나머지는 회색 처리)
- **막 비대칭성 보기** — 두 leaflet을 위아래로 벌려 조성 비교
- **PS 외부 노출 보기** — 안쪽 PS 일부가 호를 그리며 바깥층으로 이동
- **분자 확대**(범례 클릭 또는 3D 분자 클릭) — 확대 모델 + 부위별 라벨 + 정보 카드
- 라벨 표시 / 자동 회전 토글, Reset

수록 지질: PC · PE · PS · PI · PIP2 · SM · 콜레스테롤

### 모듈 2 — 세포막 인지질과 PIP2 신호전달

> PIP2 하나가 잘리면 왜 서로 다른 두 신호 분자가 생기고, 왜 하나는 막에 남고 하나는 세포질로 퍼질까?

7단계: PIP2 위치 → PLC 결합 → 절단 → DAG/IP3 분리 → IP3 수용체 결합 → Ca²⁺ 방출 → PKC 활성화

- **재생 / 일시정지**, 이전 단계 · 다음 단계, 단계 목록 직접 선택
- 바로가기: PIP2 위치 보기 · PLC 작용 · 절단 애니메이션 재생 · **DAG / IP3 비교**(비교표) · Ca²⁺ 방출 보기
- 라벨 표시 토글, Reset

원형질막(위) · 세포질(가운데) · ER 막과 lumen(아래)이 한 장면에 있어 위아래 방향이 헷갈리지 않습니다.

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
- 모든 지오메트리는 저·중폴리곤이며 재질은 색상 단위로 캐시해 재사용합니다. 데스크톱에서 60 fps로 동작합니다.
- WebGL을 쓸 수 없으면 캔버스 자리에 안내 문구가 남고, 설명 패널·단계 버튼·지질 정보는 계속 동작합니다.

## 과학적 단순화

세부 내용은 [`docs/SCIENTIFIC_NOTES.md`](docs/SCIENTIFIC_NOTES.md)에 정리했습니다. 요약하면:

- 막 조성은 **동물 세포 원형질막의 대표적 경향**을 단순화한 것이며 고정 비율이 아닙니다.
- 모듈 2는 Gq–PLCβ 계열의 **대표적(canonical) 경로 예시**입니다. 아형과 세포 종류에 따라 달라집니다.
- 모듈 3은 **짝수 탄소 포화 지방산(palmitate, C16)** 예시입니다.
- 지질 분자는 원자 수준 구조가 아니라 머리·골격·꼬리를 구분해 보여 주는 도식 모델입니다.

## 라이선스

수업 자료. `assets/vendor/three.module.min.js`는 Three.js(MIT License, © Three.js authors)입니다.
