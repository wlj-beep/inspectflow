export function createJobflowAdapter(apiClient) {
  return {
    users: {
      list: (role) => apiClient.users.list(role)
    },
    roles: {
      list: (role) => apiClient.roles.list(role)
    },
    sessions: {
      start: (userId, role) => apiClient.sessions.start(userId, role),
      end: (userId, role) => apiClient.sessions.end(userId, role)
    },
    records: {
      get: (id, role) => apiClient.records.get(id, role)
    },
    async loadBootstrap(role) {
      const [toolsList, toolLocationsList, partsList] = await Promise.all([
        apiClient.tools.list(role),
        apiClient.toolLocations.list(role),
        apiClient.parts.list(role)
      ]);
      const partDetails = await Promise.all((partsList || []).map((p) => apiClient.parts.get(p.id, role)));
      const [jobsList, recordsList] = await Promise.all([
        apiClient.jobs.list({}, role),
        apiClient.records.list({}, role)
      ]);
      return {
        toolsList,
        toolLocationsList,
        partDetails,
        jobsList,
        recordsList
      };
    }
  };
}
