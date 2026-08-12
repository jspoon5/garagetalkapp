import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";
import { Upload, X, FileVideo, CheckCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 524288000, // 500MB default for videos
  allowedFileTypes = ['video/*'],
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);

  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
        allowedFileTypes,
      },
      autoProceed: false,
    })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: onGetUploadParameters,
      })
      .on("progress", (progressValue) => {
        setProgress(progressValue);
      })
      .on("complete", (result) => {
        setUploading(false);
        setUploadComplete(true);
        setTimeout(() => {
          setShowModal(false);
          setSelectedFile(null);
          setProgress(0);
          setUploadComplete(false);
          onComplete?.(result);
        }, 1000);
      })
      .on("error", (err) => {
        setError(err.message || "Upload failed");
        setUploading(false);
      })
  );

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const isValidType = allowedFileTypes.some(type => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.replace('/*', '/'));
        }
        return file.type === type;
      });

      if (!isValidType) {
        setError(`Invalid file type. Allowed: ${allowedFileTypes.join(', ')}`);
        return;
      }

      if (file.size > maxFileSize) {
        setError(`File too large. Maximum size: ${Math.round(maxFileSize / 1024 / 1024)}MB`);
        return;
      }

      setError(null);
      setSelectedFile(file);
      uppy.cancelAll();
      uppy.addFile({
        name: file.name,
        type: file.type,
        data: file,
      });
    }
  }, [uppy, allowedFileTypes, maxFileSize]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      await uppy.upload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  }, [uppy, selectedFile]);

  const handleClose = () => {
    if (!uploading) {
      setShowModal(false);
      setSelectedFile(null);
      setError(null);
      setProgress(0);
      uppy.cancelAll();
    }
  };

  return (
    <div>
      <Button type="button" onClick={() => setShowModal(true)} className={buttonClassName} data-testid="button-upload-video">
        {children}
      </Button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
          <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Upload File</h3>
              <Button variant="ghost" size="icon" onClick={handleClose} disabled={uploading} data-testid="button-close-upload">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            {!selectedFile ? (
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer hover-elevate transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Max size: {Math.round(maxFileSize / 1024 / 1024)}MB
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept={allowedFileTypes.join(',')}
                  onChange={handleFileSelect}
                  data-testid="input-file-upload"
                />
              </label>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  {uploadComplete ? (
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  ) : (
                    <FileVideo className="w-8 h-8 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                {uploading && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-center text-muted-foreground">{progress}% uploaded</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSelectedFile(null);
                      uppy.cancelAll();
                    }}
                    disabled={uploading}
                    data-testid="button-cancel-file"
                  >
                    Change File
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleUpload}
                    disabled={uploading || uploadComplete}
                    data-testid="button-start-upload"
                  >
                    {uploading ? "Uploading..." : uploadComplete ? "Done!" : "Upload"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
