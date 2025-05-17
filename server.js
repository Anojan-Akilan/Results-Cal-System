require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Atlas Connection
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB Atlas'))
.catch(err => console.error('MongoDB connection error:', err));

// Result Schema
const resultSchema = new mongoose.Schema({
  indexNo: { type: String, required: true },
  name: { type: String, required: true },
  semester: { type: Number, required: true },
  year: { type: Number, required: true },
  courses: [{
    code: String,
    grade: String,
    creditHours: Number,
    qualityPoints: Number
  }],
  semesterGPA: Number,
  yearGPA: Number,
  finalGPA: Number,
  finalClass: String
});

const Result = mongoose.model('Result', resultSchema);

// File Upload Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Grade Points Mapping
const gradePoints = {
  'A+': 4.0, 'A': 3.7, 'A-': 3.3,
  'B+': 3.0, 'B': 2.7, 'B-': 2.3,
  'C+': 2.0, 'C': 1.7, 'C-': 1.3,
  'F': 0.0
};

// Image Preprocessing and OCR Processing
const processResultSheet = async (imagePath) => {
  try {
    // Preprocess image
    const processedImage = await sharp(imagePath)
      .greyscale()
      .normalize()
      .threshold(128)
      .toBuffer();

    const processedPath = path.join(__dirname, 'processed.png');
    await sharp(processedImage).toFile(processedPath);

    // OCR Processing
    const worker = await createWorker();
    
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/.+-| ',
      preserve_interword_spaces: '1'
    });

    const { data: { text } } = await worker.recognize(processedPath);
    await worker.terminate();
    
    // Clean up processed image
    fs.unlinkSync(processedPath);

    return text;
  } catch (error) {
    console.error('Image processing error:', error);
    throw error;
  }
};

// Parse OCR Text
const parseResultText = (text, semester, year) => {
  const lines = text.split('\n')
    .map(line => line.replace(/\|/g, '').trim())
    .filter(line => line && !line.startsWith('-'));

  if (lines.length < 2) {
    throw new Error('Insufficient data extracted from image');
  }

  const headers = lines[0].split(/\s{2,}/).filter(col => col.trim() !== '');
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(/\s{2,}/).filter(col => col.trim() !== '');
    
    if (columns.length >= 7) {
      const indexNo = columns[0].trim();
      const name = columns[1].trim();
      const courses = [];
      let totalQualityPoints = 0;
      let totalCreditHours = 0;

      for (let j = 2; j < 7; j++) {
        const courseCode = headers[j] || `CO${year}${semester}${j}${j}`;
        const grade = columns[j].trim().toUpperCase();
        
        if (!gradePoints[grade]) {
          throw new Error(`Invalid grade '${grade}' for ${name}`);
        }

        const creditHours = parseInt(courseCode[3]) || 2;
        const qualityPoints = gradePoints[grade] * creditHours;
        
        courses.push({
          code: courseCode,
          grade,
          creditHours,
          qualityPoints
        });

        totalQualityPoints += qualityPoints;
        totalCreditHours += creditHours;
      }

      results.push({
        indexNo,
        name,
        semester,
        year,
        courses,
        semesterGPA: totalQualityPoints / totalCreditHours
      });
    }
  }

  return results;
};

// Upload Result Sheet Endpoint
app.post('/api/upload', upload.single('resultSheet'), async (req, res) => {
  try {
    const { semester, year } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Process image and extract text
    const ocrText = await processResultSheet(req.file.path);
    console.log('OCR Output:', ocrText);

    // Parse and validate results
    const results = parseResultText(ocrText, semester, year);

    // Save to database
    await Result.insertMany(results);
    
    res.status(200).json({ 
      success: true,
      message: 'Results processed successfully',
      count: results.length
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Result processing failed',
      details: error.message
    });
  } finally {
    // Clean up uploaded file
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// Calculate Final GPA Endpoint
app.post('/api/calculate-final', async (req, res) => {
  try {
    const allResults = await Result.find();
    const students = {};

    // Group results by student
    allResults.forEach(result => {
      if (!students[result.indexNo]) {
        students[result.indexNo] = {
          name: result.name,
          results: []
        };
      }
      students[result.indexNo].results.push(result);
    });

    // Process each student
    for (const [indexNo, student] of Object.entries(students)) {
      const resultsByYear = {};
      
      // Group by year
      student.results.forEach(result => {
        if (!resultsByYear[result.year]) {
          resultsByYear[result.year] = [];
        }
        resultsByYear[result.year].push(result);
      });

      // Calculate year GPAs
      const yearGPAs = {};
      let totalYearGPA = 0;
      let yearCount = 0;

      for (const [year, results] of Object.entries(resultsByYear)) {
        const yearGPA = results.reduce((sum, r) => sum + r.semesterGPA, 0) / results.length;
        yearGPAs[year] = parseFloat(yearGPA.toFixed(2));
        totalYearGPA += yearGPA;
        yearCount++;
      }

      // Calculate final GPA and class
      const finalGPA = parseFloat((totalYearGPA / yearCount).toFixed(2));
      let finalClass = 'Just Pass';
      
      if (finalGPA >= 3.7) finalClass = 'First Class';
      else if (finalGPA >= 3.3) finalClass = 'Second Upper Class';
      else if (finalGPA >= 3.0) finalClass = 'Second Lower Class';

      // Update all records for this student
      await Result.updateMany(
        { indexNo },
        { 
          yearGPA: yearGPAs,
          finalGPA,
          finalClass 
        }
      );
    }

    res.status(200).json({ 
      success: true,
      message: 'Final GPA calculated for all students'
    });

  } catch (error) {
    console.error('GPA calculation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'GPA calculation failed',
      details: error.message
    });
  }
});

// Get Student Result Endpoint
app.get('/api/student/:indexNo', async (req, res) => {
  try {
    const result = await Result.findOne({ indexNo: req.params.indexNo })
      .sort({ _id: -1 })
      .lean();

    if (!result) {
      return res.status(404).json({ 
        success: false,
        error: 'Student not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Student lookup error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch student result',
      details: error.message
    });
  }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('System error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const multer = require('multer');
// const { createWorker } = require('tesseract.js');
// const path = require('path');
// const bodyParser = require('body-parser');
// require('dotenv').config(); // Add this line

// const app = express();
// app.use(cors());
// app.use(bodyParser.json());

// // MongoDB Atlas connection
// //const atlasUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_CLUSTER}.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;

// // MongoDB Atlas connection
// mongoose.connect( process.env.MONGO_URL )
//   .then(() => console.log('Connected to MongoDB Atlas'))
//   .catch(err => {
//     console.error('Error connecting to MongoDB Atlas:', err);
//     console.log('Connection string used:', process.env.MONGO_URL);
//   });

// // ... rest of the server code remains the same ...

// // Result Schema
// const resultSchema = new mongoose.Schema({
//   indexNo: String,
//   name: String,
//   semester: Number,
//   year: Number,
//   courses: [{
//     code: String,
//     grade: String,
//     creditHours: Number,
//     qualityPoints: Number
//   }],
//   semesterGPA: Number,
//   yearGPA: Number,
//   finalGPA: Number,
//   finalClass: String
// });

// const Result = mongoose.model('Result', resultSchema);

// // File upload setup
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/');
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + path.extname(file.originalname));
//   }
// });

// const upload = multer({ storage });

// // Grade to points mapping
// const gradePoints = {
//   'A+': 4.0,
//   'A': 3.7,
//   'A-': 3.3,
//   'B+': 3.0,
//   'B': 2.7,
//   'B-': 2.3,
//   'C+': 2.0,
//   'C': 1.7,
//   'C-': 1.3,
//   'F': 0.0
// };

// // Process image and extract data
// // Process image and extract data - UPDATED VERSION
// app.post('/api/upload', upload.single('resultSheet'), async (req, res) => {
//   try {
//     const { semester, year } = req.body;
    
//     // Initialize Tesseract worker with error handling
//     const worker = await createWorker();
//     try {
//       // const ret = await worker.recognize('https://tesseract.projectnaptha.com/img/eng_bw.png');
//       // console.log(ret.data.text);
//       // await worker.terminate();
      
//       // OCR recognition with improved configuration
//       const { data: { text } } = await worker.recognize(req.file.path, {
//         preserve_interword_spaces: 1,
//         tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.+-| ',
//         tessedit_pageseg_mode: 6
//       });

//       console.log('OCR Output:', text); // Debug log

//       // Clean and parse the text
//       const lines = text.split('\n')
//         .map(line => line.replace(/\|/g, '').trim()) // Remove pipe characters
//         .filter(line => line && !line.startsWith('-')); // Remove empty lines and separators

//       if (lines.length < 2) {
//         throw new Error('Not enough data extracted from the image');
//       }

//       const results = [];
//       const headers = lines[0].split(/\s{2,}/).filter(col => col.trim() !== '');

//       // Process each student line
//       for (let i = 1; i < lines.length; i++) {
//         const columns = lines[i].split(/\s{2,}/).filter(col => col.trim() !== '');
        
//         if (columns.length >= 7) {
//           const indexNo = columns[0].trim();
//           const name = columns[1].trim();
//           const courses = [];
//           let totalQualityPoints = 0;
//           let totalCreditHours = 0;

//           // Process each course
//           for (let j = 2; j < 7; j++) {
//             const courseCode = headers[j] || `CO${year}${semester}${j}${j}`; // Fallback
//             const grade = columns[j].trim().toUpperCase();
            
//             if (!gradePoints[grade]) {
//               throw new Error(`Invalid grade '${grade}' for student ${name}`);
//             }

//             const creditHours = parseInt(courseCode[3]) || 2; // Default to 2 if parsing fails
//             const qualityPoints = gradePoints[grade] * creditHours;
            
//             courses.push({
//               code: courseCode,
//               grade,
//               creditHours,
//               qualityPoints
//             });

//             totalQualityPoints += qualityPoints;
//             totalCreditHours += creditHours;
//           }

//           const semesterGPA = totalQualityPoints / totalCreditHours;

//           results.push({
//             indexNo,
//             name,
//             semester,
//             year,
//             courses,
//             semesterGPA
//           });
//         }
//       }

//       // Save to database
//       await Result.insertMany(results);
      
//       res.status(200).json({ 
//         message: 'Results processed successfully', 
//         results 
//       });

//     } finally {
//       await worker.terminate(); // Ensure worker is always terminated
//     }
    
//   } catch (error) {
//     console.error('Error processing result sheet:', error);
//     res.status(500).json({ 
//       error: 'Error processing result sheet',
//       details: error.message 
//     });
//   }
// });
// // app.post('/api/upload', upload.single('resultSheet'), async (req, res) => {
// //   try {
// //     const { semester, year } = req.body;
    
// //     // Modern Tesseract.js initialization
// //     const worker = await createWorker('eng');  // Simplified initialization
// //     const { data :{text}} = await worker.recognize(req.file.path);
// //     console.log(data); // Log the recognized text for debugging
// //     await worker.terminate();

// //     const lines = text.split('\n').filter(line => line.trim() !== '');
// //     const results = [];

// //     // Process each line (student result)
// //     for (let i = 1; i < lines.length; i++) {
// //       const columns = lines[i].split(/\s{2,}/).filter(col => col.trim() !== '');
// //       if (columns.length >= 7) {
// //         const indexNo = columns[0];
// //         const name = columns[1];
// //         const courses = [];
// //         let totalQualityPoints = 0;
// //         let totalCreditHours = 0;

// //         for (let j = 2; j < 7; j++) {
// //           const courseCode = lines[0].split(/\s{2,}/)[j];
// //           const grade = columns[j];
// //           const creditHours = parseInt(courseCode[3]);
// //           const qualityPoints = gradePoints[grade] * creditHours;
          
// //           courses.push({
// //             code: courseCode,
// //             grade,
// //             creditHours,
// //             qualityPoints
// //           });

// //           totalQualityPoints += qualityPoints;
// //           totalCreditHours += creditHours;
// //         }

// //         const semesterGPA = totalQualityPoints / totalCreditHours;

// //         results.push({
// //           indexNo,
// //           name,
// //           semester,
// //           year,
// //           courses,
// //           semesterGPA
// //         });
// //       }
// //     }

// //     // Save to database
// //     await Result.insertMany(results);
    
// //     // Calculate year and final GPA (this would be triggered after all semesters are uploaded)
// //     res.status(200).json({ message: 'Results processed successfully', results });
// //   } catch (error) {
// //     console.error(error);
// //     res.status(500).json({ error: 'Error processing result sheet' });
// //   }
// // });

// // Calculate final GPA and class
// app.post('/api/calculate-final', async (req, res) => {
//   try {
//     const allResults = await Result.find();
//     const students = {};

//     // Group by student indexNo
//     allResults.forEach(result => {
//       if (!students[result.indexNo]) {
//         students[result.indexNo] = {
//           name: result.name,
//           results: []
//         };
//       }
//       students[result.indexNo].results.push(result);
//     });

//     // Calculate year and final GPA for each student
//     for (const indexNo in students) {
//       const student = students[indexNo];
//       const resultsByYear = {};

//       // Group results by year
//       student.results.forEach(result => {
//         if (!resultsByYear[result.year]) {
//           resultsByYear[result.year] = [];
//         }
//         resultsByYear[result.year].push(result);
//       });

//       // Calculate year GPA
//       let totalYearGPA = 0;
//       let yearCount = 0;
//       const yearGPAs = {};

//       for (const year in resultsByYear) {
//         const yearResults = resultsByYear[year];
//         const yearGPA = yearResults.reduce((sum, result) => sum + result.semesterGPA, 0) / yearResults.length;
//         yearGPAs[year] = yearGPA;
//         totalYearGPA += yearGPA;
//         yearCount++;
//       }

//       // Calculate final GPA
//       const finalGPA = totalYearGPA / yearCount;
//       let finalClass = '';

//       if (finalGPA >= 3.7) finalClass = 'First Class';
//       else if (finalGPA >= 3.3) finalClass = 'Second Upper Class';
//       else if (finalGPA >= 3.0) finalClass = 'Second Lower Class';
//       else finalClass = 'Just Pass';

//       // Update all records for this student
//       await Result.updateMany(
//         { indexNo },
//         { 
//           yearGPA: yearGPAs,
//           finalGPA,
//           finalClass 
//         }
//       );
//     }

//     res.status(200).json({ message: 'Final GPA calculated for all students' });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Error calculating final GPA' });
//   }
// });

// // Get student result
// app.get('/api/student/:indexNo', async (req, res) => {
//   try {
//     const result = await Result.findOne({ indexNo: req.params.indexNo }).sort({ _id: -1 });
//     if (!result) {
//       return res.status(404).json({ error: 'Student not found' });
//     }
//     res.status(200).json(result);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Error fetching student result' });
//   }
// });

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));