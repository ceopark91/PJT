# 제조 프로젝트 관리 시스템 - Google 생태계 연동

## 🏭 프로젝트 개요

Google Sheets와 Google Drive를 활용한 클라우드 기반 제조 프로젝트 관리 시스템입니다. 기존의 localStorage 방식에서 Google 생태계로 업그레이드하여 더 안정적이고 확장 가능한 프로젝트 관리를 제공합니다.

## ✨ 주요 기능

### 📊 Google Sheets 연동
- 프로젝트 데이터를 Google Sheets에 실시간 저장
- 부서별 업무 흐름 관리 (영업 → 경리 → 설계 → 생산 → 완료)
- 프로젝트별 모델 정보 관리
- 자동 데이터 백업 및 동기화

### 📁 Google Drive 연동
- 프로젝트별 자동 폴더 생성
- 부서별 폴더 관리 (영업부/경리부/설계부/생산부)
- 파일 자동 분류 및 정리
- 드래그 앤 드롭 파일 업로드

### 🔄 실시간 협업
- 여러 사용자 동시 접속 가능
- 실시간 데이터 업데이트
- Google 계정 기반 인증

## 🚀 시작하기

### 1. Google Cloud Console 설정

#### Google Sheets API 활성화
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. "API 및 서비스" → "라이브러리" 이동
4. "Google Sheets API" 검색 및 활성화
5. "Google Drive API" 검색 및 활성화

#### API 키 발급
1. "API 및 서비스" → "사용자 인증 정보" 이동
2. "사용자 인증 정보 만들기" → "API 키" 선택
3. 생성된 API 키 복사
4. API 키 제한 설정 (선택사항)

### 2. Google Sheets 설정

#### 스프레드시트 생성
1. [Google Sheets](https://sheets.google.com/) 접속
2. 새 스프레드시트 생성
3. 시트 이름 변경: "프로젝트관리"
4. 추가 시트 생성: "모델정보"
5. 스프레드시트 ID 복사 (URL에서 `/d/`와 `/edit` 사이의 값)

#### 시트 구조 설정
프로젝트관리 시트의 A1:O1 범위에 다음 헤더 입력:
```
프로젝트ID | 영업담당자 | 고객사 | 최종고객 | 상태 | 현재부서 | 생성일시 | 납기요청일 | W/P납기요청일 | 설계메모 | 생산상태 | 실제출고일 | 지연사유 | 현장이슈 | 계산메모
```

모델정보 시트의 A1:G1 범위에 다음 헤더 입력:
```
프로젝트ID | S/N | 모델 | 수량 | W/P납기일 | 제품납기일 | 사양
```

### 3. 설정 파일 구성

#### `google-config.js` 파일 수정
```javascript
const GOOGLE_CONFIG = {
    API_KEY: 'YOUR_GOOGLE_API_KEY',  // 발급받은 API 키
    SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',  // 스프레드시트 ID
    SHEET_NAME: '프로젝트관리'
};
```

#### Google OAuth 클라이언트 ID 설정
```javascript
// index.html의 Google 인증 부분 수정
window.google.accounts.id.initialize({
    client_id: 'YOUR_GOOGLE_CLIENT_ID',  // OAuth 클라이언트 ID
    callback: handleGoogleAuth
});
```

## 📁 폴더 구조

```
제조프로젝트관리/
├── PJ-240116-H01_삼성전자/
│   ├── 영업부/
│   │   ├── 작업의뢰서_20240116_143022.pdf
│   │   └── 견적서_20240116_143145.xlsx
│   ├── 경리부/
│   │   └── 통장사본_20240116_143301.jpg
│   ├── 설계부/
│   └── 생산부/
├── PJ-240116-C02_LG화학/
│   ├── 영업부/
│   ├── 경리부/
│   ├── 설계부/
│   └── 생산부/
```

## 🎯 사용법

### 1. 프로젝트 생성
1. Google 계정으로 로그인
2. "새 프로젝트" 버튼 클릭
3. 영업담당자, 고객사명 등 기본 정보 입력
4. 작업의뢰서 및 기타자료 첨부
5. 저장 버튼 클릭

### 2. 파일 업로드
- 각 부서별로 파일을 업로드할 수 있습니다
- 파일은 자동으로 해당 프로젝트의 부서 폴더에 저장됩니다
- 지원하는 파일 형식: PDF, Excel, Word, 이미지 등

### 3. 업무 흐름
1. **영업부**: 프로젝트 생성 및 기본 정보 입력
2. **경리부**: 납기요청일 설정, 모델 정보 입력
3. **설계부**: 설계 특이사항 입력
4. **생산부**: 제작상태, 실제출고일 입력
5. **완료**: 프로젝트 완료 처리

## 🔧 API 엔드포인트

### 프로젝트 관리
- `GET tables/프로젝트관리` - 프로젝트 목록 조회
- `POST tables/프로젝트관리` - 프로젝트 생성
- `PUT tables/프로젝트관리/{id}` - 프로젝트 수정
- `DELETE tables/프로젝트관리/{id}` - 프로젝트 삭제

### 모델 정보
- `GET tables/모델정보` - 모델 목록 조회
- `POST tables/모델정보` - 모델 생성
- `PUT tables/모델정보/{id}` - 모델 수정
- `DELETE tables/모델정보/{id}` - 모델 삭제

## 🛠️ 개발자 가이드

### Google Sheets API 사용
```javascript
import GoogleSheetsManager from './google-sheets-manager.js';

const sheetsManager = new GoogleSheetsManager();
await sheetsManager.initializeSheet();

// 모든 프로젝트 조회
const projects = await sheetsManager.getAllProjects();

// 프로젝트 생성
const newProject = await sheetsManager.createProject(projectData);

// 프로젝트 업데이트
await sheetsManager.updateProject(projectId, updateData);
```

### Google Drive API 사용
```javascript
import GoogleDriveManager from './google-drive-manager.js';

const driveManager = new GoogleDriveManager();
await driveManager.initialize();

// 파일 업로드
const result = await driveManager.uploadFile(
    file,           // File 객체
    projectId,      // 프로젝트 ID
    '영업부',        // 부서명
    '작업의뢰서'     // 파일 유형
);

// 프로젝트 폴더 구조 생성
const folders = await driveManager.createProjectFolderStructure(
    projectId,
    projectName
);
```

## 🔒 보안 고려사항

### API 키 보호
- API 키는 클라이언트 사이드에 노출되므로 도메인 제한 설정 권장
- 프로덕션 환경에서는 서버 사이드 프록시 사용 권장

### 데이터 접근 제어
- Google 계정 기반 인증으로 접근 제어
- 부서별 권한 설정 가능
- 민감한 데이터는 암호화하여 저장 권장

## 🐛 문제 해결

### API 키 오류
```
Error: API key not found
```
**해결방법**: google-config.js 파일의 API_KEY가 올바르게 설정되었는지 확인

### 스프레드시트 접근 오류
```
Error: Spreadsheet not found
```
**해결방법**: 
1. 스프레드시트 ID가 올바른지 확인
2. Google Sheets API가 활성화되었는지 확인
3. 스프레드시트가 공유되어 있는지 확인

### 파일 업로드 오류
```
Error: File upload failed
```
**해결방법**:
1. Google Drive API가 활성화되었는지 확인
2. 파일 크기가 제한을 초과하지 않는지 확인 (최대 5MB 권장)
3. 파일 형식이 지원되는지 확인

## 📈 성능 최적화

### 데이터 로딩 최적화
- 페이지네이션 구현
- 검색 필터링 최적화
- 캐싱 전략 적용

### 파일 관리 최적화
- 이미지 압축
- 파일 크기 제한
- 불필요한 파일 정기 정리

## 🔄 업데이트 로그

### v2.0.0 (2024-01-16)
- Google Sheets 연동 추가
- Google Drive 파일 관리 기능 추가
- Google OAuth 인증 구현
- 부서별 폴더 자동 생성
- 실시간 데이터 동기화

### v1.0.0 (기존)
- localStorage 기반 데이터 저장
- 기본적인 프로젝트 관리 기능

## 📞 지원

문의사항이나 버그 리포트는 GitHub Issues를 통해 제보해주세요.

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.