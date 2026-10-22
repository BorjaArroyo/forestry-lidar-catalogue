/* Keep transport failures distinct from HTTP and malformed-response failures. */
export class ServiceConnectionError extends Error {}
export class ServiceResponseError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function createServiceClient({ fetch, enabled }) {
  return {
    async request(path, body, token) {
      if (!enabled) throw new ServiceConnectionError('Connect the local Canopy service to download into a chosen directory.');
      let response;
      try {
        response = await fetch(path, body ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Canopy-Token': token },
          body: JSON.stringify(body),
        } : {});
      } catch (error) {
        throw new ServiceConnectionError(`Cannot connect to the local service: ${error.message}`);
      }
      let result;
      try {
        result = await response.json();
      } catch {
        throw new ServiceResponseError(`The local service returned an invalid response (HTTP ${response.status}).`, response.status);
      }
      if (!response.ok) throw new ServiceResponseError(result.error || `The local service returned HTTP ${response.status}.`, response.status);
      if (result === null || typeof result !== 'object' || Array.isArray(result))
        throw new ServiceResponseError('The local service returned an invalid JSON object.', response.status);
      return result;
    },
  };
}
