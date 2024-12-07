import { Clipboard, LaunchProps, LocalStorage, showHUD, showToast } from "@raycast/api";
import { authorize, client, createTokens, refreshTokens } from "./vk-oauth";
import { VKApiService } from "./services/vk-api";
import { VKApiError } from "./services/errors";

export default async function Command(
  props: LaunchProps<{
    arguments: { title: string };
    launchContext?: {
      device_id: string;
      code: string;
    };
  }>,
) {
  try {
    // Обработка начальной авторизации
    if (props.launchContext) {
      showToast({ title: "Авторизация", message: "Сохраняем токены" });
      await createTokens(props.launchContext);
    }

    // Проверка наличия токена
    const tokenSet = await client.getTokens();
    if (!tokenSet?.accessToken) {
      showToast({ title: "Авторизация", message: "Авторизуемся в VK" });
      return await authorize({ title: props.arguments.title });
    }

    // Получение ID пользователя
    const userId: string | undefined = await LocalStorage.getItem("vk_user_id");
    if (!userId) {
      throw new Error("ID пользователя не найден");
    }

    // Создание звонка
    const title = props.arguments.title || "Новый звонок";
    showToast({
      title: "Создание звонка",
      message: `Создаем звонок в VK Calls с названием "${title}"`,
    });

    const vkApi = new VKApiService(tokenSet.accessToken);
    await createCallWithRetry(vkApi, userId, title);
  } catch (error) {
    handleError(error);
  }
}

async function createCallWithRetry(vkApi: VKApiService, userId: string, title: string): Promise<void> {
  try {
    const data = await vkApi.createCall(userId, title);
    await Clipboard.copy(data.response.join_link);
    await showHUD("Ссылка на звонок скопирована в буфер обмена");
  } catch (error) {
    if (error instanceof VKApiError) {
      if (error.error_msg.includes("access_token has expired.")) {
        console.log("access_token has expired.");
        await handleExpiredToken(userId, title);
      } else if (error.error_code === 5) {
        showToast({ title: "Требуется повторная авторизация" });
        await authorize({ title });
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
}

async function handleExpiredToken(userId: string, title: string): Promise<void> {
  showToast({ title: "Обновляем токены" });
  const newTokens = await refreshTokens();
  await client.setTokens(newTokens);

  if (!newTokens.accessToken) {
    throw new Error("Не удалось обновить токен");
  }

  const vkApi = new VKApiService(newTokens.accessToken);
  await createCallWithRetry(vkApi, userId, title);
}

function handleError(error: unknown): void {
  console.error("Ошибка:", error);

  const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка при создании звонка";

  showHUD(errorMessage);
}
