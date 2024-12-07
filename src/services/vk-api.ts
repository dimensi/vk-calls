import { CONFIG } from "../config";
import fetch from "node-fetch";
import { isVKError, VKApiError } from "./errors";

export interface CallsStartResponse {
  /**
   * Call id
   */
  call_id?: string;
  /**
   * Join link
   */
  join_link: string;
  /**
   * OK join link
   */
  ok_join_link: string;
  /**
   * video id for link
   */
  broadcast_video_id?: string;
  /**
   * video id for streaming
   */
  broadcast_ov_id?: string;
  short_credentials?: CallsShortCredentials;
}
export interface CallsShortCredentials {
  /**
   * Short numeric ID of a call
   */
  id: string;
  /**
   * Password that can be used to join a call by short numeric ID
   */
  password: string;
  /**
   * Link without a password
   */
  link_without_password: string;
  /**
   * Link with a password
   */
  link_with_password: string;
}

export class VKApiService {
  constructor(private accessToken: string) {}

  async createCall(userId: string, title: string) {
    const url = new URL(`${CONFIG.API_BASE_URL}/calls.start`);
    url.searchParams.set("user_id", userId);
    url.searchParams.set("v", CONFIG.API_VERSION);
    url.searchParams.set("access_token", this.accessToken);
    url.searchParams.set("name", title);

    const response = await fetch(url);
    const data = await response.json();

    if (isVKError(data)) {
      throw new VKApiError(data);
    }

    return data as { response: CallsStartResponse };
  }
}
