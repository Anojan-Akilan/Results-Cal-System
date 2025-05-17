import React, { useState } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Doughnut } from 'react-chartjs-2';

function App() {
  const [files, setFiles] = useState([]);
  const [semester, setSemester] = useState(1);
  const [year, setYear] = useState(1);
  const [indexNo, setIndexNo] = useState('');
  const [studentResult, setStudentResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg']
    },
    maxFiles: 1,
    onDrop: acceptedFiles => {
      setFiles(acceptedFiles.map(file => Object.assign(file, {
        preview: URL.createObjectURL(file)
      })));
    }
  });

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error('Please upload result sheet image');
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append('resultSheet', files[0]);
    formData.append('semester', semester);
    formData.append('year', year);

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      toast.success(response.data.message);
      setFiles([]);
      console.log('Upload successful:', response.data);
      
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error.response?.data?.details 
        || error.response?.data?.error 
        || 'Error processing result sheet';
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCalculateFinal = async () => {
    try {
      setIsLoading(true);
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/calculate-final`
      );
      toast.success(response.data.message);
    } catch (error) {
      console.error('Calculation error:', error);
      toast.error(error.response?.data?.error || 'Error calculating final GPA');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFindStudent = async () => {
    if (!indexNo) {
      toast.error('Please enter index number');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/${indexNo}`
      );
      
      if (response.data.success) {
        setStudentResult(response.data.data);
      } else {
        toast.error(response.data.error || 'Student not found');
        setStudentResult(null);
      }
    } catch (error) {
      console.error('Lookup error:', error);
      toast.error(error.response?.data?.error || 'Error fetching student data');
      setStudentResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  // GPA Chart Data
  const gpaChartData = {
    labels: ['First Year', 'Second Year', 'Third Year'],
    datasets: [{
      data: studentResult?.yearGPA 
        ? Object.values(studentResult.yearGPA).map(gpa => parseFloat(gpa.toFixed(2)))
        : [0, 0, 0],
      backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
      hoverBackgroundColor: ['#FF6384', '#36A2EB', '#FFCE56']
    }]
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <ToastContainer position="top-right" autoClose={5000} />
      
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-blue-800">
          University Result Processing System
        </h1>
        
        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Upload Result Sheet</h2>
          
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="w-full md:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year
              </label>
              <select 
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
              >
                <option value={1}>First Year</option>
                <option value={2}>Second Year</option>
                <option value={3}>Third Year</option>
              </select>
            </div>
            
            <div className="w-full md:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Semester
              </label>
              <select 
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                value={semester}
                onChange={(e) => setSemester(parseInt(e.target.value))}
              >
                <option value={1}>First Semester</option>
                <option value={2}>Second Semester</option>
              </select>
            </div>
          </div>
          
          <div 
            {...getRootProps()} 
            className="border-2 border-dashed border-gray-300 rounded p-8 text-center mb-4 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <input {...getInputProps()} />
            <p className="text-gray-600">
              Drag & drop result sheet image here, or click to select
            </p>
            <p className="text-sm text-gray-500 mt-2">
              (Supports PNG, JPG, JPEG)
            </p>
          </div>
          
          {files.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 bg-gray-50 p-3 rounded">
                <span className="font-medium">{files[0].name}</span>
                <button 
                  onClick={() => setFiles([])}
                  className="text-red-500 hover:text-red-700 ml-auto"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
          
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300 transition-colors flex-1 min-w-[200px]"
            >
              {isLoading ? 'Processing...' : 'Submit Result Sheet'}
            </button>
            
            <button
              onClick={handleCalculateFinal}
              disabled={isLoading}
              className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:bg-green-300 transition-colors flex-1 min-w-[200px]"
            >
              Calculate Final GPA
            </button>
          </div>
        </div>
        
        {/* Student Lookup Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Find Student Result</h2>
          
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <input
              type="text"
              placeholder="Enter Index Number (e.g., 20/COM/386)"
              className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500"
              value={indexNo}
              onChange={(e) => setIndexNo(e.target.value)}
            />
            <button
              onClick={handleFindStudent}
              disabled={isLoading}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300 transition-colors md:w-auto"
            >
              {isLoading ? 'Searching...' : 'Find'}
            </button>
          </div>
          
          {studentResult && (
            <div className="mt-6 space-y-6">
              {/* Student Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-3">Student Details</h3>
                  <div className="space-y-2">
                    <p><span className="font-medium">Name:</span> {studentResult.name}</p>
                    <p><span className="font-medium">Index No:</span> {studentResult.indexNo}</p>
                    <p><span className="font-medium">Final GPA:</span> {studentResult.finalGPA?.toFixed(2) || 'N/A'}</p>
                    <p>
                      <span className="font-medium">Final Class:</span> 
                      <span className={`font-bold ml-2 ${
                        studentResult.finalClass === 'First Class' ? 'text-green-600' :
                        studentResult.finalClass === 'Second Upper Class' ? 'text-blue-600' :
                        studentResult.finalClass === 'Second Lower Class' ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {studentResult.finalClass || 'N/A'}
                      </span>
                    </p>
                  </div>
                  
                  <h3 className="text-lg font-medium mt-6 mb-3">Year-wise GPA</h3>
                  <div className="space-y-2">
                    {studentResult.yearGPA && Object.entries(studentResult.yearGPA).map(([year, gpa]) => (
                      <p key={year}>
                        <span className="font-medium">Year {year}:</span> {gpa?.toFixed(2) || 'N/A'}
                      </p>
                    ))}
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-3">GPA Distribution</h3>
                  <div className="h-64">
                    <Doughnut 
                      data={gpaChartData}
                      options={{
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom'
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
              
              {/* Course Results */}
              <div>
                <h3 className="text-lg font-medium mb-3">Semester Results</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-3 px-4 border font-semibold text-left">Course Code</th>
                        <th className="py-3 px-4 border font-semibold text-left">Grade</th>
                        <th className="py-3 px-4 border font-semibold text-left">Credit Hours</th>
                        <th className="py-3 px-4 border font-semibold text-left">Quality Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentResult.courses?.map((course, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td className="py-2 px-4 border">{course.code}</td>
                          <td className="py-2 px-4 border font-medium">{course.grade}</td>
                          <td className="py-2 px-4 border">{course.creditHours}</td>
                          <td className="py-2 px-4 border">{course.qualityPoints?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;













// import React, { useState } from 'react';
// import axios from 'axios';
// import { useDropzone } from 'react-dropzone';
// import { ToastContainer, toast } from 'react-toastify';
// import 'react-toastify/dist/ReactToastify.css';
// import { Doughnut } from 'react-chartjs-2';

// function App() {
//   const [files, setFiles] = useState([]);
//   const [semester, setSemester] = useState(1);
//   const [year, setYear] = useState(1);
//   const [indexNo, setIndexNo] = useState('');
//   const [studentResult, setStudentResult] = useState(null);
//   const [isLoading, setIsLoading] = useState(false);

//   const { getRootProps, getInputProps } = useDropzone({
//     accept: 'image/*',
//     onDrop: acceptedFiles => {
//       setFiles(acceptedFiles.map(file => Object.assign(file, {
//         preview: URL.createObjectURL(file)
//       })));
//     }
//   });

//   const apiUrl = import.meta.env.VITE_API_URL;

//   const handleSubmit = async () => {
//     if (files.length === 0) {
//       toast.error('Please upload result sheet image');
//       return;
//     }

//     setIsLoading(true);
//     const formData = new FormData();
//     formData.append('resultSheet', files[0]);
//     formData.append('semester', semester);
//     formData.append('year', year);

//     try {
//       await axios.post(`${apiUrl}/api/upload`, formData, {
//         headers: {
//           'Content-Type': 'multipart/form-data'
//         }
//       });
//       toast.success('Result sheet processed successfully');
//       setFiles([]);
//     } catch (error) {
//       toast.error('Error processing result sheet');
//       console.error(error);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleCalculateFinal = async () => {
//     try {
//       await axios.post(`${apiUrl}/api/calculate-final`);
//       toast.success('Final GPA calculated for all students');
//     } catch (error) {
//       toast.error('Error calculating final GPA');
//       console.error(error);
//     }
//   };

//   const handleFindStudent = async () => {
//     if (!indexNo) {
//       toast.error('Please enter index number');
//       return;
//     }

//     setIsLoading(true);
//     try {
//       const response = await axios.get(`${apiUrl}/api/student/${indexNo}`);
//       setStudentResult(response.data);
//     } catch (error) {
//       toast.error('Student not found');
//       setStudentResult(null);
//       console.error(error);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const data = {
//     labels: ['First Year', 'Second Year', 'Third Year'],
//     datasets: [
//       {
//         data: studentResult ? [
//           studentResult.yearGPA['1'] || 0,
//           studentResult.yearGPA['2'] || 0,
//           studentResult.yearGPA['3'] || 0
//         ] : [0, 0, 0],
//         backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
//         hoverBackgroundColor: ['#FF6384', '#36A2EB', '#FFCE56']
//       }
//     ]
//   };

//   return (
//     <div className="min-h-screen bg-gray-100 p-8">
//       <ToastContainer />
//       <h1 className="text-3xl font-bold text-center mb-8 text-blue-800">University Result Processing System</h1>
      
//       <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6 mb-8">
//         <h2 className="text-xl font-semibold mb-4">Upload Result Sheet</h2>
        
//         <div className="flex flex-wrap gap-4 mb-4">
//           <div className="w-full md:w-48">
//             <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
//             <select 
//               className="w-full p-2 border rounded"
//               value={year}
//               onChange={(e) => setYear(parseInt(e.target.value))}
//             >
//               <option value={1}>First Year</option>
//               <option value={2}>Second Year</option>
//               <option value={3}>Third Year</option>
//             </select>
//           </div>
          
//           <div className="w-full md:w-48">
//             <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
//             <select 
//               className="w-full p-2 border rounded"
//               value={semester}
//               onChange={(e) => setSemester(parseInt(e.target.value))}
//             >
//               <option value={1}>First Semester</option>
//               <option value={2}>Second Semester</option>
//             </select>
//           </div>
//         </div>
        
//         <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded p-8 text-center mb-4 cursor-pointer hover:bg-gray-50">
//           <input {...getInputProps()} />
//           <p>Drag & drop result sheet image here, or click to select</p>
//         </div>
        
//         {files.length > 0 && (
//           <div className="mb-4">
//             <h4 className="text-sm font-medium text-gray-700 mb-2">Selected file:</h4>
//             <div className="flex items-center gap-2">
//               <span>{files[0].name}</span>
//               <button 
//                 onClick={() => setFiles([])}
//                 className="text-red-500 hover:text-red-700"
//               >
//                 Remove
//               </button>
//             </div>
//           </div>
//         )}
        
//         <div className="flex gap-4">
//           <button
//             onClick={handleSubmit}
//             disabled={isLoading}
//             className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300"
//           >
//             {isLoading ? 'Processing...' : 'Submit Result Sheet'}
//           </button>
          
//           <button
//             onClick={handleCalculateFinal}
//             className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
//           >
//             Calculate Final GPA
//           </button>
//         </div>
//       </div>
      
//       <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
//         <h2 className="text-xl font-semibold mb-4">Find Student Result</h2>
        
//         <div className="flex gap-4 mb-4">
//           <input
//             type="text"
//             placeholder="Enter Index Number (e.g., 20/COM/386)"
//             className="flex-1 p-2 border rounded"
//             value={indexNo}
//             onChange={(e) => setIndexNo(e.target.value)}
//           />
//           <button
//             onClick={handleFindStudent}
//             disabled={isLoading}
//             className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300"
//           >
//             {isLoading ? 'Searching...' : 'Find'}
//           </button>
//         </div>
        
//         {studentResult && (
//           <div className="mt-6">
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
//               <div>
//                 <h3 className="text-lg font-medium mb-2">Student Details</h3>
//                 <div className="bg-gray-50 p-4 rounded">
//                   <p><span className="font-medium">Name:</span> {studentResult.name}</p>
//                   <p><span className="font-medium">Index No:</span> {studentResult.indexNo}</p>
//                   <p><span className="font-medium">Final GPA:</span> {studentResult.finalGPA.toFixed(2)}</p>
//                   <p><span className="font-medium">Final Class:</span> <span className="font-bold">{studentResult.finalClass}</span></p>
//                 </div>
                
//                 <h3 className="text-lg font-medium mt-6 mb-2">Year-wise GPA</h3>
//                 <div className="bg-gray-50 p-4 rounded">
//                   {studentResult.yearGPA && Object.entries(studentResult.yearGPA).map(([year, gpa]) => (
//                     <p key={year}>
//                       <span className="font-medium">Year {year}:</span> {gpa.toFixed(2)}
//                     </p>
//                   ))}
//                 </div>
//               </div>
              
//               <div>
//                 <h3 className="text-lg font-medium mb-2">GPA Distribution</h3>
//                 <Doughnut data={data} />
//               </div>
//             </div>
            
//             <h3 className="text-lg font-medium mt-8 mb-2">Semester Results</h3>
//             {studentResult.courses && (
//               <div className="overflow-x-auto">
//                 <table className="min-w-full bg-white border">
//                   <thead>
//                     <tr>
//                       <th className="py-2 px-4 border">Course Code</th>
//                       <th className="py-2 px-4 border">Grade</th>
//                       <th className="py-2 px-4 border">Credit Hours</th>
//                       <th className="py-2 px-4 border">Quality Points</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {studentResult.courses.map((course, index) => (
//                       <tr key={index}>
//                         <td className="py-2 px-4 border">{course.code}</td>
//                         <td className="py-2 px-4 border">{course.grade}</td>
//                         <td className="py-2 px-4 border">{course.creditHours}</td>
//                         <td className="py-2 px-4 border">{course.qualityPoints.toFixed(2)}</td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               </div>
//             )}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// export default App;