// Google Sheets API 설정
const GOOGLE_CONFIG = {
  // Google Cloud Console에서 발급받은 API 키
  API_KEY: 'YOUR_GOOGLE_API_KEY',
  
  // Google Sheets ID (스프레드시트 URL에서 추출)
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
  
  // 시트 이름
  SHEET_NAME: '프로젝트관리',
  
  // Google Drive API 설정
  DRIVE_CONFIG: {
    FOLDER_STRUCTURE: {
      ROOT_FOLDER_NAME: '제조프로젝트관리',
      DEPARTMENT_FOLDERS: ['영업부', '경리부', '설계부', '생산부']
    }
  }
};

// Google Sheets API 엔드포인트
const GOOGLE_SHEETS_API = {
  // 데이터 읽기
  READ: (spreadsheetId, range) => 
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${GOOGLE_CONFIG.API_KEY}`,
  
  // 데이터 쓰기 (업데이트)
  UPDATE: (spreadsheetId, range) =>
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW&key=${GOOGLE_CONFIG.API_KEY}`,
  
  // 데이터 추가
  APPEND: (spreadsheetId, range) =>
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&key=${GOOGLE_CONFIG.API_KEY}`
};

// Google Drive API 엔드포인트
const GOOGLE_DRIVE_API = {
  // 파일 업로드
  UPLOAD: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
  
  // 파일 검색
  SEARCH: (query) => 
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${GOOGLE_CONFIG.API_KEY}`,
  
  // 폴더 생성
  CREATE_FOLDER: 'https://www.googleapis.com/drive/v3/files',
  
  // 파일 다운로드
  DOWNLOAD: (fileId) =>
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_CONFIG.API_KEY}`
};

// 프로젝트 데이터 구조
const PROJECT_SCHEMA = {
  // 시트 헤더
  HEADERS: [
    '프로젝트ID', '영업담당자', '고객사', '최종고객', '상태', '현재부서',
    '생성일시', '납기요청일', 'W/P납기요청일', '설계메모', '생산상태',
    '실제출고일', '지연사유', '현장이슈', '계산메모'
  ],
  
  // 모델 정보 구조
  MODEL_HEADERS: [
    '프로젝트ID', 'S/N', '모델', '수량', 'W/P납기일', '제품납기일', '사양'
  ]
};

// 부서별 권한 설정
const DEPARTMENT_PERMISSIONS = {
  '영업': ['create', 'read', 'update'],
  '경리': ['read', 'update'],
  '설계': ['read', 'update'],
  '생산': ['read', 'update'],
  '완료': ['read']
};

export {
  GOOGLE_CONFIG,
  GOOGLE_SHEETS_API,
  GOOGLE_DRIVE_API,
  PROJECT_SCHEMA,
  DEPARTMENT_PERMISSIONS
};