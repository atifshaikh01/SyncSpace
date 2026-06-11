import mongoose from 'mongoose';
export const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/syncspace';
        // Set strictQuery to prepare for Mongoose upgrades
        mongoose.set('strictQuery', false);
        await mongoose.connect(mongoURI);
        console.log('💚 MongoDB Connected successfully.');
    }
    catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
};
//# sourceMappingURL=db.js.map