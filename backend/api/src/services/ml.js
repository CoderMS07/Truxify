class MLService {
  async handleResponse(response, url = '', method = 'GET') {
    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error(`[MLService] Failed to parse JSON response from ${method} ${url} (Status: ${response.status})`);
    }

    if (response.status === 401) {
      throw new Error(`[MLService] Unauthorized (401) for ${method} ${url}`);
    }

    if (response.status === 403) {
      throw new Error(`[MLService] Forbidden (403) for ${method} ${url}`);
    }

    if (!response.ok) {
      throw new Error(`[MLService] Request failed with status ${response.status} for ${method} ${url}`);
    }

    return data;
  }
}

module.exports = new MLService();
