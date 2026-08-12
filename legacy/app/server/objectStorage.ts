import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool"
      );
    }
    return dir;
  }

  async getVideoUploadURL(): Promise<{ uploadURL: string; videoId: string }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const videoId = randomUUID();
    const fullPath = `${privateObjectDir}/videos/${videoId}.mp4`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900, // 15 minutes
    });

    return { uploadURL, videoId };
  }

  async getVideoFile(videoId: string): Promise<File> {
    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/videos/${videoId}.mp4`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    
    return file;
  }

  async downloadVideo(file: File, res: Response & { req?: any }) {
    try {
      const [metadata] = await file.getMetadata();
      const fileSize = metadata.size || 0;
      
      // Support range requests for video seeking
      const range = res.req?.get?.('range') || res.req?.headers?.range;
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : Number(fileSize) - 1;
        const chunkSize = (end - start) + 1;
        
        res.status(206);
        res.set({
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": "video/mp4",
          "Cache-Control": "public, max-age=3600",
        });
        
        const stream = file.createReadStream({ start, end });
        stream.on("error", (err) => {
          console.error("Stream error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Error streaming file" });
          }
        });
        stream.pipe(res);
      } else {
        res.set({
          "Content-Type": "video/mp4",
          "Content-Length": fileSize.toString(),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        });

        const stream = file.createReadStream();
        stream.on("error", (err) => {
          console.error("Stream error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Error streaming file" });
          }
        });
        stream.pipe(res);
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  getVideoURL(videoId: string): string {
    return `/videos/${videoId}`;
  }

  async getAudioUploadURL(): Promise<{ uploadURL: string; audioId: string }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const audioId = randomUUID();
    const fullPath = `${privateObjectDir}/podcasts/${audioId}.mp3`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900, // 15 minutes
    });

    return { uploadURL, audioId };
  }

  async getAudioFile(audioId: string): Promise<File> {
    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/podcasts/${audioId}.mp3`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    
    return file;
  }

  async downloadAudio(file: File, res: Response) {
    try {
      const [metadata] = await file.getMetadata();
      
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": metadata.size,
        "Cache-Control": "public, max-age=3600",
        "Accept-Ranges": "bytes",
      });

      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading audio:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading audio" });
      }
    }
  }

  getAudioURL(audioId: string): string {
    return `/podcasts/${audioId}`;
  }

  // Recording storage methods
  async getRecordingUploadURL(userId: string): Promise<{ uploadURL: string; recordingId: string }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const recordingId = randomUUID();
    const fullPath = `${privateObjectDir}/recordings/${userId}/${recordingId}.webm`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900, // 15 minutes
    });

    return { uploadURL, recordingId };
  }

  async getRecordingFile(userId: string, recordingId: string): Promise<File> {
    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/recordings/${userId}/${recordingId}.webm`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    
    return file;
  }

  async downloadRecording(file: File, res: Response & { req?: any }) {
    try {
      const [metadata] = await file.getMetadata();
      const fileSize = metadata.size || 0;
      
      // Support range requests for video seeking
      const range = res.req?.get?.('range') || res.req?.headers?.range;
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : Number(fileSize) - 1;
        const chunkSize = (end - start) + 1;
        
        res.status(206);
        res.set({
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": "video/webm",
          "Cache-Control": "private, max-age=3600",
        });
        
        const stream = file.createReadStream({ start, end });
        stream.on("error", (err) => {
          console.error("Stream error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Error streaming file" });
          }
        });
        stream.pipe(res);
      } else {
        res.set({
          "Content-Type": "video/webm",
          "Content-Length": fileSize.toString(),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        });

        const stream = file.createReadStream();
        stream.on("error", (err) => {
          console.error("Stream error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Error streaming file" });
          }
        });
        stream.pipe(res);
      }
    } catch (error) {
      console.error("Error downloading recording:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  getRecordingURL(recordingId: string): string {
    return `/api/recordings/${recordingId}/stream`;
  }

  // Folder management for recordings
  async listRecordingFolders(userId: string): Promise<{ folders: string[]; files: Array<{ name: string; size: number; updatedAt: Date }> }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const basePath = `${privateObjectDir}/recordings/${userId}/`;
    const { bucketName, objectName } = parseObjectPath(basePath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    
    // List all objects with the user's recording prefix
    const [files] = await bucket.getFiles({ prefix: objectName });
    
    const folders = new Set<string>();
    const fileList: Array<{ name: string; size: number; updatedAt: Date }> = [];
    
    for (const file of files) {
      const relativePath = file.name.replace(objectName, '');
      
      // Check if it's in a subfolder
      if (relativePath.includes('/')) {
        const folderName = relativePath.split('/')[0];
        if (folderName && !folderName.endsWith('.webm')) {
          folders.add(folderName);
        }
      } else if (relativePath.endsWith('.webm')) {
        const [metadata] = await file.getMetadata();
        fileList.push({
          name: relativePath,
          size: Number(metadata.size) || 0,
          updatedAt: new Date(metadata.updated || Date.now()),
        });
      }
    }
    
    return { folders: Array.from(folders).sort(), files: fileList };
  }

  async createRecordingFolder(userId: string, folderName: string): Promise<string> {
    // Sanitize folder name to prevent path traversal - only allow alphanumeric, hyphens, underscores
    const sanitizedName = folderName
      .replace(/[^a-zA-Z0-9-_]/g, '_')  // Replace unsafe chars with underscore
      .replace(/_{2,}/g, '_')            // Collapse multiple underscores
      .replace(/^_|_$/g, '')             // Trim leading/trailing underscores
      .slice(0, 50);
    if (!sanitizedName) {
      throw new Error('Invalid folder name');
    }
    
    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/recordings/${userId}/${sanitizedName}/.folder`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    // Create a placeholder file to represent the folder
    await file.save('');
    
    // Return the sanitized name so frontend uses the canonical value
    return sanitizedName;
  }

  async getRecordingUploadURLWithFolder(userId: string, folderPath?: string): Promise<{ uploadURL: string; recordingId: string }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const recordingId = randomUUID();
    
    // Sanitize folder path - only allow alphanumeric, hyphens, underscores
    let safeFolderPath = '';
    if (folderPath && folderPath.trim()) {
      safeFolderPath = folderPath
        .replace(/[^a-zA-Z0-9-_]/g, '_')  // Replace unsafe chars (including /, \) with underscore
        .replace(/_{2,}/g, '_')            // Collapse multiple underscores
        .replace(/^_|_$/g, '')             // Trim leading/trailing underscores
        .slice(0, 50);
      if (safeFolderPath) {
        safeFolderPath = `${safeFolderPath}/`;
      }
    }
    
    const fullPath = `${privateObjectDir}/recordings/${userId}/${safeFolderPath}${recordingId}.webm`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900, // 15 minutes
    });

    return { uploadURL, recordingId };
  }

  async getRecordingFileWithFolder(userId: string, recordingId: string, folderPath?: string): Promise<File> {
    const privateObjectDir = this.getPrivateObjectDir();
    
    // Sanitize folder path - must match sanitization in upload to ensure consistency
    let safeFolderPath = '';
    if (folderPath && folderPath.trim()) {
      safeFolderPath = folderPath
        .replace(/[^a-zA-Z0-9-_]/g, '_')  // Replace unsafe chars with underscore
        .replace(/_{2,}/g, '_')            // Collapse multiple underscores
        .replace(/^_|_$/g, '')             // Trim leading/trailing underscores
        .slice(0, 50);
      if (safeFolderPath) {
        safeFolderPath = `${safeFolderPath}/`;
      }
    }
    
    const fullPath = `${privateObjectDir}/recordings/${userId}/${safeFolderPath}${recordingId}.webm`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    
    return file;
  }

  async getAvatarUploadURL(userId: string, extension: string): Promise<{ uploadURL: string; avatarPath: string }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const avatarId = randomUUID();
    const fullPath = `${privateObjectDir}/avatars/${userId}/${avatarId}.${extension}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900, // 15 minutes
    });

    return { uploadURL, avatarPath: fullPath };
  }

  async getAvatarFile(avatarPath: string): Promise<File> {
    const { bucketName, objectName } = parseObjectPath(avatarPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    
    return file;
  }

  async downloadAvatar(file: File, res: Response, contentType: string) {
    try {
      const [metadata] = await file.getMetadata();
      
      res.set({
        "Content-Type": contentType,
        "Content-Length": metadata.size,
        "Cache-Control": "public, max-age=86400",
      });

      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading avatar:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading avatar" });
      }
    }
  }

  getAvatarServeURL(avatarPath: string): string {
    // Extract just the relative path after the private dir for serving
    const encoded = encodeURIComponent(avatarPath);
    return `/api/avatars/${encoded}`;
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return { bucketName, objectName };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}
