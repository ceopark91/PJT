import { GOOGLE_CONFIG, GOOGLE_DRIVE_API } from './google-config.js';

/**
 * Google Drive 파일 관리자
 * 프로젝트별로 폴더를 생성하고 부서별로 파일을 관리합니다.
 */
class GoogleDriveManager {
  constructor() {
    this.apiKey = GOOGLE_CONFIG.API_KEY;
    this.folderStructure = GOOGLE_CONFIG.DRIVE_CONFIG.FOLDER_STRUCTURE;
    this.rootFolderId = null;
    this.departmentFolderIds = {};
  }

  /**
   * 초기 설정 - 루트 폴더와 부서별 폴더 확인/생성
   */
  async initialize() {
    try {
      // 루트 폴더 확인 또는 생성
      this.rootFolderId = await this.findOrCreateFolder(
        this.folderStructure.ROOT_FOLDER_NAME,
        'root'
      );

      // 부서별 폴더 확인 또는 생성
      for (const dept of this.folderStructure.DEPARTMENT_FOLDERS) {
        const folderId = await this.findOrCreateFolder(dept, this.rootFolderId);
        this.departmentFolderIds[dept] = folderId;
      }

      console.log('Google Drive 초기화 완료:', {
        rootFolderId: this.rootFolderId,
        departmentFolders: this.departmentFolderIds
      });

    } catch (error) {
      console.error('Google Drive 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * 폴더 찾기 또는 생성
   */
  async findOrCreateFolder(folderName, parentId = 'root') {
    try {
      // 기존 폴더 검색
      const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
      const searchUrl = GOOGLE_DRIVE_API.SEARCH(query);
      
      const response = await fetch(searchUrl);
      const result = await response.json();

      if (result.files && result.files.length > 0) {
        return result.files[0].id;
      }

      // 폴더가 없으면 생성
      return await this.createFolder(folderName, parentId);
    } catch (error) {
      console.error('폴더 찾기/생성 실패:', error);
      throw error;
    }
  }

  /**
   * 폴더 생성
   */
  async createFolder(folderName, parentId) {
    const metadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    };

    const response = await fetch(GOOGLE_DRIVE_API.CREATE_FOLDER + '?key=' + this.apiKey, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata)
    });

    if (!response.ok) {
      throw new Error('폴더 생성 실패: ' + response.statusText);
    }

    const result = await response.json();
    return result.id;
  }

  /**
   * 프로젝트별 폴더 구조 생성
   */
  async createProjectFolderStructure(projectId, projectName) {
    try {
      if (!this.rootFolderId) {
        await this.initialize();
      }

      // 프로젝트 루트 폴더
      const projectFolderName = `${projectId}_${projectName}`;
      const projectFolderId = await this.findOrCreateFolder(
        projectFolderName,
        this.rootFolderId
      );

      // 부서별 하위 폴더
      const departmentFolders = {};
      for (const dept of this.folderStructure.DEPARTMENT_FOLDERS) {
        const deptFolderId = await this.findOrCreateFolder(dept, projectFolderId);
        departmentFolders[dept] = deptFolderId;
      }

      return {
        projectFolderId,
        departmentFolders
      };
    } catch (error) {
      console.error('프로젝트 폴더 구조 생성 실패:', error);
      throw error;
    }
  }

  /**
   파일 업로드
   */
  async uploadFile(file, projectId, department, fileType = '기타') {
    try {
      if (!file) {
        throw new Error('업로드할 파일이 없습니다.');
      }

      // 프로젝트 폴더 구조 확인
      let projectFolders = await this.getProjectFolders(projectId);
      if (!projectFolders) {
        // 프로젝트 폴더가 없으면 생성
        const projectData = await this.getProjectData(projectId);
        projectFolders = await this.createProjectFolderStructure(
          projectId,
          projectData?.customer || 'Unknown'
        );
      }

      const departmentFolderId = projectFolders.departmentFolders[department];
      if (!departmentFolderId) {
        throw new Error(`부서 폴더를 찾을 수 없습니다: ${department}`);
      }

      // 파일 메타데이터
      const metadata = {
        name: `${Date.now()}_${file.name}`,
        parents: [departmentFolderId],
        description: `프로젝트: ${projectId}, 부서: ${department}, 유형: ${fileType}`,
        properties: {
          projectId: projectId,
          department: department,
          fileType: fileType,
          uploadDate: new Date().toISOString(),
          originalName: file.name
        }
      };

      // FormData 생성
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', file);

      // 파일 업로드
      const response = await fetch(GOOGLE_DRIVE_API.UPLOAD + '&key=' + this.apiKey, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('파일 업로드 실패: ' + response.statusText);
      }

      const result = await response.json();
      
      console.log('파일 업로드 성공:', {
        fileId: result.id,
        fileName: result.name,
        projectId: projectId,
        department: department
      });

      return {
        fileId: result.id,
        fileName: result.name,
        webViewLink: result.webViewLink,
        webContentLink: result.webContentLink
      };

    } catch (error) {
      console.error('파일 업로드 실패:', error);
      throw error;
    }
  }

  /**
   * 여러 파일 업로드
   */
  async uploadFiles(files, projectId, department, fileType = '기타') {
    const uploadPromises = Array.from(files).map(file => 
      this.uploadFile(file, projectId, department, fileType)
    );

    try {
      const results = await Promise.allSettled(uploadPromises);
      const successful = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      const failed = results.filter(result => result.status === 'rejected').map(result => result.reason);

      if (failed.length > 0) {
        console.warn('일부 파일 업로드 실패:', failed);
      }

      return {
        successful: successful,
        failed: failed,
        total: files.length,
        uploaded: successful.length
      };
    } catch (error) {
      console.error('파일 일괄 업로드 실패:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 폴더 정보 가져오기
   */
  async getProjectFolders(projectId) {
    try {
      // 프로젝트 폴더 검색
      const query = `name contains '${projectId}' and mimeType='application/vnd.google-apps.folder' and '${this.rootFolderId}' in parents and trashed=false`;
      const searchUrl = GOOGLE_DRIVE_API.SEARCH(query);
      
      const response = await fetch(searchUrl);
      const result = await response.json();

      if (result.files && result.files.length > 0) {
        const projectFolder = result.files[0];
        const projectFolderId = projectFolder.id;

        // 부서별 하위 폴더 검색
        const departmentFolders = {};
        for (const dept of this.folderStructure.DEPARTMENT_FOLDERS) {
          const deptQuery = `name='${dept}' and mimeType='application/vnd.google-apps.folder' and '${projectFolderId}' in parents and trashed=false`;
          const deptSearchUrl = GOOGLE_DRIVE_API.SEARCH(deptQuery);
          
          const deptResponse = await fetch(deptSearchUrl);
          const deptResult = await deptResponse.json();

          if (deptResult.files && deptResult.files.length > 0) {
            departmentFolders[dept] = deptResult.files[0].id;
          }
        }

        return {
          projectFolderId: projectFolderId,
          projectFolderName: projectFolder.name,
          departmentFolders: departmentFolders
        };
      }

      return null;
    } catch (error) {
      console.error('프로젝트 폴더 검색 실패:', error);
      return null;
    }
  }

  /**
   * 프로젝트 데이터 가져오기 (Sheets API에서)
   */
  async getProjectData(projectId) {
    // 이 메서드는 GoogleSheetsManager 클래스에서 구현됩니다
    // 여기서는 임시로 null 반환
    return null;
  }

  /**
   * 파일 다운로드 URL 생성
   */
  getDownloadUrl(fileId) {
    return GOOGLE_DRIVE_API.DOWNLOAD(fileId);
  }

  /**
   * 부서별 파일 목록 가져오기
   */
  async getDepartmentFiles(projectId, department) {
    try {
      const projectFolders = await this.getProjectFolders(projectId);
      if (!projectFolders) {
        return [];
      }

      const departmentFolderId = projectFolders.departmentFolders[department];
      if (!departmentFolderId) {
        return [];
      }

      // 해당 부서 폴더의 파일들 검색
      const query = `'${departmentFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
      const searchUrl = GOOGLE_DRIVE_API.SEARCH(query);
      
      const response = await fetch(searchUrl);
      const result = await response.json();

      if (result.files) {
        return result.files.map(file => ({
          id: file.id,
          name: file.name,
          size: file.size,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          webViewLink: file.webViewLink,
          webContentLink: file.webContentLink,
          mimeType: file.mimeType,
          description: file.description
        }));
      }

      return [];
    } catch (error) {
      console.error('부서별 파일 목록 가져오기 실패:', error);
      return [];
    }
  }
}

export default GoogleDriveManager;