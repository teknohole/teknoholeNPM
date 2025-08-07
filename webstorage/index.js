import axios from 'axios';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

export default class WebStorage {
  constructor({ apiKey }) {
    if (!apiKey) {
      throw new Error('API Key diperlukan untuk menggunakan SDK ini.');
    }
    this.apiKey = apiKey;
    this.serviceUrl = 'https://storage.teknohole.com';
  }

  _getHeaders() {
    return {
      'Authorization': `ApiKey ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Private helper SELALU mengembalikan objek terstruktur
   * @param {import('axios').AxiosRequestConfig} config
   * @returns {Promise<{success: boolean, status: number, data: any, message: string}>}
   */
  async _request(config) {
    try {
      const response = await axios(config);
      return {
        success: true,
        status: response.status,
        data: response.data,
        message: response.data?.message || response.statusText,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const responseData = error.response.data;
        return {
          success: false,
          status: error.response.status,
          data: responseData,
          message: responseData?.message || responseData?.detail || 'Terjadi kesalahan pada server.',
        };
      }
      return {
        success: false,
        status: 500,
        data: null,
        message: `Request gagal: ${error.message}`,
      };
    }
  }

  async uploadFile(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File tidak ditemukan di path: ${filePath}`);
    }
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileName = path.basename(filePath);
    const fileType = mime.lookup(filePath) || 'application/octet-stream';

    if (fileSize > 5 * 1024 * 1024 * 1024) { // 5 GB
      throw new Error("Ukuran file melebihi batas yang diizinkan (5 GB).");
    }

    const presignedUrlResult = await this._request({
      method: 'POST',
      url: `${this.serviceUrl}/cdn/upload-url/`,
      headers: this._getHeaders(),
      data: { fileName, fileType, fileSize },
    });
    
    if (!presignedUrlResult.success) {
      return presignedUrlResult;
    }

    const { url, key } = presignedUrlResult.data;

    const fileStream = fs.createReadStream(filePath);
    const uploadResult = await this._request({
        method: 'PUT',
        url: url,
        data: fileStream,
        headers: {
            'Content-Type': fileType,
            'Content-Length': fileSize,
        },
        onUploadProgress: (progressEvent) => {
            if (options.onProgress && typeof options.onProgress === 'function') {
                const percentComplete = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                options.onProgress(percentComplete);
            }
        },
    });

    if (!uploadResult.success) {
        return uploadResult;
    }

    return {
      success: true,
      status: uploadResult.status,
      data: { key },
      message: 'File berhasil diunggah.',
    };
  }

  async deleteFile(objectKey) {
    const result = await this._request({
      method: 'DELETE',
      url: `${this.serviceUrl}/cdn/delete-object/`,
      headers: this._getHeaders(),
      data: { key: objectKey },
    });
    return result;
  }
}