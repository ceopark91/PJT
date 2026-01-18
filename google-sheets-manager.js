import { GOOGLE_CONFIG, GOOGLE_SHEETS_API, PROJECT_SCHEMA } from './google-config.js';

/**
 * Google Sheets 데이터베이스 관리자
 * 프로젝트 데이터를 Google Sheets에 저장하고 관리합니다.
 */
class GoogleSheetsManager {
  constructor() {
    this.apiKey = GOOGLE_CONFIG.API_KEY;
    this.spreadsheetId = GOOGLE_CONFIG.SPREADSHEET_ID;
    this.sheetName = GOOGLE_CONFIG.SHEET_NAME;
    this.modelSheetName = '모델정보';
  }

  /**
   * 시트 초기 설정
   */
  async initializeSheet() {
    try {
      // 시트 존재 여부 확인
      const sheetExists = await this.checkSheetExists(this.sheetName);
      if (!sheetExists) {
        // 시트가 없으면 생성 (API를 통해 직접 생성은 복잡하므로 수동 생성 권장)
        console.warn(`시트 '${this.sheetName}'가 존재하지 않습니다. Google Sheets에서 수동으로 생성해주세요.`);
        return false;
      }

      // 헤더 확인 및 설정
      await this.setupHeaders();
      
      // 모델 정보 시트 확인
      const modelSheetExists = await this.checkSheetExists(this.modelSheetName);
      if (!modelSheetExists) {
        console.warn(`시트 '${this.modelSheetName}'가 존재하지 않습니다. Google Sheets에서 수동으로 생성해주세요.`);
      } else {
        await this.setupModelHeaders();
      }

      return true;
    } catch (error) {
      console.error('시트 초기화 실패:', error);
      return false;
    }
  }

  /**
   * 시트 존재 여부 확인
   */
  async checkSheetExists(sheetName) {
    try {
      const range = `${sheetName}!A1:A1`;
      const url = GOOGLE_SHEETS_API.READ(this.spreadsheetId, range);
      
      const response = await fetch(url);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * 헤더 설정
   */
  async setupHeaders() {
    try {
      const range = `${this.sheetName}!A1:O1`;
      const values = [PROJECT_SCHEMA.HEADERS];
      
      await this.updateRange(range, values);
      console.log('헤더 설정 완료');
    } catch (error) {
      console.error('헤더 설정 실패:', error);
    }
  }

  /**
   * 모델 정보 헤더 설정
   */
  async setupModelHeaders() {
    try {
      const range = `${this.modelSheetName}!A1:G1`;
      const values = [PROJECT_SCHEMA.MODEL_HEADERS];
      
      await this.updateRange(range, values);
      console.log('모델 정보 헤더 설정 완료');
    } catch (error) {
      console.error('모델 정보 헤더 설정 실패:', error);
    }
  }

  /**
   * 범위 업데이트
   */
  async updateRange(range, values) {
    const url = GOOGLE_SHEETS_API.UPDATE(this.spreadsheetId, range);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: range,
        majorDimension: 'ROWS',
        values: values
      })
    });

    if (!response.ok) {
      throw new Error('범위 업데이트 실패: ' + response.statusText);
    }

    return await response.json();
  }

  /**
   * 모든 프로젝트 가져오기
   */
  async getAllProjects() {
    try {
      const range = `${this.sheetName}!A2:O`;
      const url = GOOGLE_SHEETS_API.READ(this.spreadsheetId, range);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('프로젝트 데이터 읽기 실패');
      }

      const data = await response.json();
      if (!data.values || data.values.length === 0) {
        return [];
      }

      // 데이터를 프로젝트 객체로 변환
      const projects = data.values.map(row => {
        const project = {};
        PROJECT_SCHEMA.HEADERS.forEach((header, index) => {
          const value = row[index] || '';
          
          // 날짜 필드 처리
          if (['생성일시', '납기요청일', 'W/P납기요청일', '실제출고일'].includes(header) && value) {
            project[this.headerToProperty(header)] = parseInt(value) || value;
          } else if (header === '모델정보' && value) {
            try {
              project.models = JSON.parse(value);
            } catch {
              project.models = [];
            }
          } else {
            project[this.headerToProperty(header)] = value;
          }
        });
        return project;
      });

      // 각 프로젝트의 모델 정보 가져오기
      for (const project of projects) {
        project.models = await this.getProjectModels(project.id);
      }

      return projects;
    } catch (error) {
      console.error('프로젝트 데이터 읽기 실패:', error);
      return [];
    }
  }

  /**
   * 프로젝트 모델 정보 가져오기
   */
  async getProjectModels(projectId) {
    try {
      const range = `${this.modelSheetName}!A2:G`;
      const url = GOOGLE_SHEETS_API.READ(this.spreadsheetId, range);
      
      const response = await fetch(url);
      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      if (!data.values || data.values.length === 0) {
        return [];
      }

      const models = data.values
        .filter(row => row[0] === projectId)
        .map(row => ({
          sn: row[1] || '',
          model: row[2] || '',
          quantity: row[3] || '',
          wpDeliveryDate: row[4] || '',
          productDeliveryDate: row[5] || '',
          spec: row[6] || ''
        }));

      return models;
    } catch (error) {
      console.error('모델 정보 읽기 실패:', error);
      return [];
    }
  }

  /**
   * 프로젝트 생성
   */
  async createProject(projectData) {
    try {
      const row = this.projectToRow(projectData);
      const range = `${this.sheetName}!A:O`;
      const url = GOOGLE_SHEETS_API.APPEND(this.spreadsheetId, range);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: range,
          majorDimension: 'ROWS',
          values: [row]
        })
      });

      if (!response.ok) {
        throw new Error('프로젝트 생성 실패: ' + response.statusText);
      }

      // 모델 정보 저장
      if (projectData.models && projectData.models.length > 0) {
        await this.saveProjectModels(projectData.id, projectData.models);
      }

      return projectData;
    } catch (error) {
      console.error('프로젝트 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 업데이트
   */
  async updateProject(projectId, projectData) {
    try {
      // 기존 데이터 찾기
      const projects = await this.getAllProjects();
      const projectIndex = projects.findIndex(p => p.id === projectId);
      
      if (projectIndex === -1) {
        throw new Error('프로젝트를 찾을 수 없습니다: ' + projectId);
      }

      // 업데이트할 행 데이터 준비
      const updatedRow = this.projectToRow({ ...projects[projectIndex], ...projectData });
      const rowNumber = projectIndex + 2; // 헤더가 1행이므로 +2
      const range = `${this.sheetName}!A${rowNumber}:O${rowNumber}`;

      await this.updateRange(range, [updatedRow]);

      // 모델 정보 업데이트
      if (projectData.models) {
        await this.saveProjectModels(projectId, projectData.models);
      }

      return { ...projects[projectIndex], ...projectData };
    } catch (error) {
      console.error('프로젝트 업데이트 실패:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 모델 정보 저장
   */
  async saveProjectModels(projectId, models) {
    try {
      // 기존 모델 정보 삭제
      await this.deleteProjectModels(projectId);

      // 새 모델 정보 추가
      if (models && models.length > 0) {
        const modelRows = models.map(model => [
          projectId,
          model.sn || '',
          model.model || '',
          model.quantity || '',
          model.wpDeliveryDate || '',
          model.productDeliveryDate || '',
          model.spec || ''
        ]);

        const range = `${this.modelSheetName}!A:G`;
        const url = GOOGLE_SHEETS_API.APPEND(this.spreadsheetId, range);
        
        for (const row of modelRows) {
          await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              range: range,
              majorDimension: 'ROWS',
              values: [row]
            })
          });
        }
      }
    } catch (error) {
      console.error('모델 정보 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 모델 정보 삭제
   */
  async deleteProjectModels(projectId) {
    try {
      // Google Sheets API는 개별 행 삭제를 직접 지원하지 않으므로
      // 전체 데이터를 다시 작성하는 방식으로 구현
      const allModels = await this.getAllModels();
      const filteredModels = allModels.filter(model => model.projectId !== projectId);
      
      // 모델 시트 전체 재작성 (헤더 포함)
      const headerRow = PROJECT_SCHEMA.MODEL_HEADERS;
      const modelRows = filteredModels.map(model => [
        model.projectId,
        model.sn,
        model.model,
        model.quantity,
        model.wpDeliveryDate,
        model.productDeliveryDate,
        model.spec
      ]);

      const allRows = [headerRow, ...modelRows];
      const range = `${this.modelSheetName}!A1:G${allRows.length}`;
      
      await this.updateRange(range, allRows);
    } catch (error) {
      console.error('모델 정보 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 모든 모델 정보 가져오기
   */
  async getAllModels() {
    try {
      const range = `${this.modelSheetName}!A2:G`;
      const url = GOOGLE_SHEETS_API.READ(this.spreadsheetId, range);
      
      const response = await fetch(url);
      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      if (!data.values || data.values.length === 0) {
        return [];
      }

      return data.values.map(row => ({
        projectId: row[0] || '',
        sn: row[1] || '',
        model: row[2] || '',
        quantity: row[3] || '',
        wpDeliveryDate: row[4] || '',
        productDeliveryDate: row[5] || '',
        spec: row[6] || ''
      }));
    } catch (error) {
      console.error('모든 모델 정보 읽기 실패:', error);
      return [];
    }
  }

  /**
   * 프로젝트 삭제
   */
  async deleteProject(projectId) {
    try {
      // 프로젝트 데이터 삭제
      const projects = await this.getAllProjects();
      const filteredProjects = projects.filter(p => p.id !== projectId);
      
      // 시트 전체 재작성
      const headerRow = PROJECT_SCHEMA.HEADERS;
      const projectRows = filteredProjects.map(project => this.projectToRow(project));
      const allRows = [headerRow, ...projectRows];
      
      const range = `${this.sheetName}!A1:O${allRows.length}`;
      await this.updateRange(range, allRows);

      // 모델 정보 삭제
      await this.deleteProjectModels(projectId);

      return true;
    } catch (error) {
      console.error('프로젝트 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 헤더를 속성명으로 변환
   */
  headerToProperty(header) {
    const mapping = {
      '프로젝트ID': 'id',
      '영업담당자': 'salesPerson',
      '고객사': 'customer',
      '최종고객': 'endCustomer',
      '상태': 'status',
      '현재부서': 'currentDept',
      '생성일시': 'createdAt',
      '납기요청일': 'requestedDeliveryDate',
      'W/P납기요청일': 'wpRequestDeliveryDate',
      '설계메모': 'designMemo',
      '생산상태': 'productionStatus',
      '실제출고일': 'actualShipDate',
      '지연사유': 'delayReason',
      '현장이슈': 'siteIssues',
      '계산메모': 'accountingMemo'
    };
    return mapping[header] || header;
  }

  /**
   * 프로젝트를 행 데이터로 변환
   */
  projectToRow(project) {
    return [
      project.id || '',
      project.salesPerson || '',
      project.customer || '',
      project.endCustomer || '',
      project.status || '',
      project.currentDept || '',
      project.createdAt || '',
      project.requestedDeliveryDate || '',
      project.wpRequestDeliveryDate || '',
      project.designMemo || '',
      project.productionStatus || '',
      project.actualShipDate || '',
      project.delayReason || '',
      project.siteIssues || '',
      project.accountingMemo || ''
    ];
  }
}

export default GoogleSheetsManager;