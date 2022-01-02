import type { NextApiRequest, NextApiResponse } from 'next';
import { isFirebaseId } from '../../src/editorUtils';
import colorFromUserId from '../../src/scripts/colorFromUserId';
import { getAuth } from 'firebase-admin/auth';
import firebaseApp from '../../src/firebaseAdmin';

type RequestData = {
  idToken: string;
  fileID: string;
};
type ResponseData =
  | {
      fileID: string;
    }
  | {
      message: string; // error
    };

export default async (
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) => {
  const data: RequestData = req.body;

  // todo validate?
  if (!data || !data.idToken || !data.fileID || !isFirebaseId(data.fileID)) {
    res.status(400).json({
      message: 'Bad data',
    });
    return;
  }

  let decodedToken;
  try {
    decodedToken = await getAuth(firebaseApp).verifyIdToken(data.idToken);
  } catch (e) {
    res.status(400).json({
      message: 'Error decoding ID Token',
    });
    console.error(e);
    return;
  }
  const uid = decodedToken.uid;
  const displayName = decodedToken.name;

  const fileDataResp = await fetch(
    `http://127.0.0.1:9000/-${data.fileID}.json?ns=cp-ide-default-rtdb`
  );
  const fileData = await fileDataResp.json();
  if (!fileData) {
    res.status(200).send({ message: 'File Not Found' });
    return;
  }

  const fileSettings = fileData.settings;

  if (
    fileSettings.defaultPermission !== 'READ' &&
    fileSettings.defaultPermission !== 'READ_WRITE'
  ) {
    const userPerm = fileData.users?.[uid]?.permission;
    if (
      userPerm !== 'READ' &&
      userPerm !== 'READ_WRITE' &&
      userPerm !== 'OWNER'
    ) {
      res.status(403).send({ message: 'This file is private.' });
    }
  }

  const resp = await fetch(
    `http://127.0.0.1:9000/.json?ns=cp-ide-default-rtdb`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        users: {
          [uid]: {
            name: displayName,
            color: colorFromUserId(uid),
            permission: 'OWNER',
          },
        },
        'editor-cpp': fileData['editor-cpp'],
        'editor-java': fileData['editor-java'],
        'editor-py': fileData['editor-py'],
        input: fileData.input,
        scribble: fileData.scribble,
        settings: {
          ...fileData.settings,
          creationTime: {
            '.sv': 'timestamp',
          },
        },
      }),
    }
  );
  const fileID: string = (await resp.json()).name;
  res.status(200).json({ fileID: fileID.substr(1) });
};
