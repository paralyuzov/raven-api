import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AuthGuard } from '../guards/auth.guard';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

@Controller('upload')
@UseGuards(AuthGuard)
export class UploadController {
  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = './uploads';
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueId = uuidv4();
          const fileExtension = extname(file.originalname);
          const filename = `${uniqueId}${fileExtension}`;
          cb(null, filename);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
          'video/mp4',
          'video/mpeg',
          'video/quicktime',
          'video/x-msvideo', // .avi
          'video/webm',
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only image and video files are allowed (JPEG, PNG, GIF, WebP, MP4, MPEG, MOV, AVI, WebM)',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const fileType = file.mimetype.startsWith('image/') ? 'image' : 'video';

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const fileUrl = `${baseUrl}/uploads/${file.filename}`;

    return {
      statusCode: HttpStatus.OK,
      message: 'File uploaded successfully',
      data: {
        fileUrl,
        originalFileName: file.originalname,
        fileName: file.filename,
        fileSize: file.size,
        mimeType: file.mimetype,
        type: fileType,
      },
    };
  }
}
