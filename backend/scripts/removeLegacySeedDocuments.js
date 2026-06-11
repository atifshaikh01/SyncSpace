import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/db.js';
import { DocumentState } from '../src/models/DocumentState.js';

dotenv.config();

await connectDB();

const result = await DocumentState.deleteMany({
    documentName: { $in: ['get-started-doc', 'project-roadmap'] },
});

console.log(`Deleted legacy document states: ${result.deletedCount}`);
await mongoose.disconnect();
