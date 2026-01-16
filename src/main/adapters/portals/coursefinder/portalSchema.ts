import { PortalSchema } from '../../schema-types';

export const CourseFinderSchema: PortalSchema = {
  portalId: 'coursefinder-ai',
  pages: {
    // Dashboard / Manage Students
    dashboard: {
      name: 'Dashboard',
      identifyBy: { 
        urlContains: '/dashboard',
        selector: '.cf_dashboard'
      },
      fields: [],
      actions: [
        { id: 'nav_students', selector: 'a[href="/StudentApplications"]', description: 'Navigate to Students page' },
        { id: 'nav_applications', selector: 'a[href*="ManageApplication"]', description: 'Navigate to Applications' }
      ]
    },

    // Student List
    student_list: {
      name: 'Students List',
      identifyBy: {
        urlContains: '/StudentApplications',
        selector: '.student-edit-profile, #StudentTable'
      },
      fields: [],
      actions: [
        { id: 'register_student', selector: 'button:has-text("Register"), .btn:has-text("Register")', description: 'Open Register Student modal', tags: ['create'] }
      ]
    },

    // Register Student Modal
    register_student_modal: {
      name: 'Register Student Popup',
      identifyBy: { selector: '.modal.show' },
      fields: [
        { id: 'firstName', selector: '#reg_fname, input[name="FirstName"]', type: 'text', description: 'First Name', required: true },
        { id: 'lastName', selector: '#reg_lname, input[name="LastName"]', type: 'text', description: 'Last Name', required: true },
        { id: 'email', selector: '#reg_email, input[name="Email"]', type: 'email', description: 'Email', required: true },
        { id: 'phone', selector: '#reg_mobile, input[name="Mobile"]', type: 'tel', description: 'Mobile Number' }
      ],
      actions: [
        { id: 'submit', selector: '#btn-register-submit, .btn-primary:has-text("Register")', description: 'Submit registration', tags: ['submit'] }
      ]
    },

    // Edit Profile - Main Tabs Container
    edit_profile_tabs: {
      name: 'Edit Profile - Tabs',
      identifyBy: {
        urlContains: 'EditProfile',
        selector: '.MS-main-tabs'
      },
      fields: [],
      actions: [
        { id: 'tab_profile', selector: '#profileSection a', description: 'Switch to Profile tab' },
        { id: 'tab_applications', selector: '#application a', description: 'Switch to Applications tab' },
        { id: 'tab_documents', selector: '#docsView a', description: 'Switch to Documents tab' },
        { id: 'tab_payments', selector: '#paymentView a', description: 'Switch to Payments tab' }
      ]
    },

    // Personal Information Tab
    personal_info: {
      name: 'Personal Information',
      identifyBy: { selector: '#PersonalInformation.active, #PersonalInformation.show' },
      fields: [
        { id: 'firstName', selector: '#FirstName', type: 'text', description: 'First Name', required: true },
        { id: 'middleName', selector: '#MiddleName', type: 'text', description: 'Middle Name' },
        { id: 'lastName', selector: '#LastName', type: 'text', description: 'Last Name', required: true },
        { id: 'email', selector: '#Email', type: 'email', description: 'Email Address' },
        { id: 'mobile', selector: '#MobileNo', type: 'tel', description: 'Mobile Number' },
        { id: 'dob', selector: '#DateOfBirth', type: 'date', description: 'Date of Birth' },
        { id: 'gender', selector: '#Gender', type: 'select', description: 'Gender', options: ['Male', 'Female', 'Other'] },
        { id: 'maritalStatus', selector: '#MaritalStatus', type: 'select', description: 'Marital Status' },
        { id: 'passportNumber', selector: '#PassportNo, #PassportNumber', type: 'text', description: 'Passport Number' },
        { id: 'passportExpiry', selector: '#PassportExpiryDate', type: 'date', description: 'Passport Expiry' },
        { id: 'nationality', selector: '#Nationality, #NationalityId', type: 'select', description: 'Nationality' },
        { id: 'countryOfBirth', selector: '#CountryOfBirth', type: 'select', description: 'Country of Birth' },
        { id: 'address', selector: '#Address, #PermanentAddress', type: 'textarea', description: 'Address' },
        { id: 'city', selector: '#City', type: 'text', description: 'City' },
        { id: 'state', selector: '#State', type: 'text', description: 'State' },
        { id: 'pincode', selector: '#Pincode, #ZipCode', type: 'text', description: 'Postal Code' },
        { id: 'country', selector: '#Country, #CountryId', type: 'select', description: 'Country' }
      ],
      actions: [
        { id: 'save', selector: '#btnSavePersonal, button:has-text("Save")', description: 'Save Personal Info' },
        { id: 'next', selector: '#QualificationSection a', description: 'Go to Academics tab' }
      ]
    },

    // Academic Qualifications Tab
    academic_info: {
      name: 'Academic Qualifications',
      identifyBy: { selector: '#AcademicQualification.active, #AcademicQualification.show' },
      fields: [
        { id: 'countryOfEducation', selector: '#CountryofEducation', type: 'select', description: 'Country of Education' },
        { id: 'educationLevel', selector: '#LevelofEducation', type: 'select', description: 'Highest Level of Education', options: ['Postgraduate', 'Undergraduate', 'Grade 12th'] },
        { id: 'grade10School', selector: '#Grade10School, input[name*="School10"]', type: 'text', description: 'Grade 10 School Name' },
        { id: 'grade10Year', selector: '#Grade10Year, input[name*="Year10"]', type: 'text', description: 'Grade 10 Year' },
        { id: 'grade10Percentage', selector: '#Grade10Percentage, input[name*="Percentage10"]', type: 'text', description: 'Grade 10 Percentage' },
        { id: 'grade12School', selector: '#Grade12School, input[name*="School12"]', type: 'text', description: 'Grade 12 School Name' },
        { id: 'grade12Year', selector: '#Grade12Year, input[name*="Year12"]', type: 'text', description: 'Grade 12 Year' },
        { id: 'grade12Percentage', selector: '#Grade12Percentage, input[name*="Percentage12"]', type: 'text', description: 'Grade 12 Percentage' },
        { id: 'ugUniversity', selector: '#UGUniversity, input[name*="UniversityUG"]', type: 'text', description: 'UG University' },
        { id: 'ugDegree', selector: '#UGDegree, input[name*="DegreeUG"]', type: 'text', description: 'UG Degree Name' },
        { id: 'ugYear', selector: '#UGYear, input[name*="YearUG"]', type: 'text', description: 'UG Graduation Year' },
        { id: 'ugPercentage', selector: '#UGPercentage, input[name*="PercentageUG"]', type: 'text', description: 'UG Percentage/CGPA' },
        { id: 'pgUniversity', selector: '#PGUniversity, input[name*="UniversityPG"]', type: 'text', description: 'PG University' },
        { id: 'pgDegree', selector: '#PGDegree, input[name*="DegreePG"]', type: 'text', description: 'PG Degree Name' },
        { id: 'pgYear', selector: '#PGYear, input[name*="YearPG"]', type: 'text', description: 'PG Graduation Year' },
        { id: 'pgPercentage', selector: '#PGPercentage, input[name*="PercentagePG"]', type: 'text', description: 'PG Percentage/CGPA' }
      ],
      actions: [
        { id: 'save', selector: '#btnSaveAcademic, button:has-text("Save")', description: 'Save Academic Info' },
        { id: 'next', selector: '#WorkExperienceSection a', description: 'Go to Work Experience tab' }
      ]
    },

    // Work Experience Tab
    work_experience: {
      name: 'Work Experience',
      identifyBy: { selector: '#WorkExperience.active, #WorkExperience.show' },
      fields: [
        { id: 'hasWorkExp', selector: '#HasWorkExperience, input[name*="HasExperience"]', type: 'radio', description: 'Has Work Experience' },
        { id: 'companyName', selector: '#CompanyName, input[name*="Company"]', type: 'text', description: 'Company Name' },
        { id: 'designation', selector: '#Designation, input[name*="Designation"]', type: 'text', description: 'Designation/Title' },
        { id: 'startDate', selector: '#StartDate, input[name*="StartDate"]', type: 'date', description: 'Start Date' },
        { id: 'endDate', selector: '#EndDate, input[name*="EndDate"]', type: 'date', description: 'End Date' },
        { id: 'isCurrentJob', selector: '#IsCurrentJob, input[name*="CurrentJob"]', type: 'checkbox', description: 'Currently Working' }
      ],
      actions: [
        { id: 'save', selector: '#btnSaveWork, button:has-text("Save")', description: 'Save Work Experience' },
        { id: 'next', selector: '#testSection a', description: 'Go to Tests tab' }
      ]
    },

    // Tests Tab
    tests: {
      name: 'Tests',
      identifyBy: { selector: '#Tests.active, #Tests.show' },
      fields: [
        { id: 'englishTestType', selector: '#EnglishTestType', type: 'select', description: 'English Test Type', options: ['IELTS', 'TOEFL', 'PTE', 'DET'] },
        { id: 'ieltsOverall', selector: '#IELTSOverall, input[name*="IELTSOverall"]', type: 'text', description: 'IELTS Overall Score' },
        { id: 'ieltsListening', selector: '#IELTSListening', type: 'text', description: 'IELTS Listening' },
        { id: 'ieltsReading', selector: '#IELTSReading', type: 'text', description: 'IELTS Reading' },
        { id: 'ieltsWriting', selector: '#IELTSWriting', type: 'text', description: 'IELTS Writing' },
        { id: 'ieltsSpeaking', selector: '#IELTSSpeaking', type: 'text', description: 'IELTS Speaking' },
        { id: 'toeflTotal', selector: '#TOEFLTotal, input[name*="TOEFLTotal"]', type: 'text', description: 'TOEFL Total Score' },
        { id: 'pteOverall', selector: '#PTEOverall, input[name*="PTEOverall"]', type: 'text', description: 'PTE Overall Score' },
        { id: 'detOverall', selector: '#DETOverall, input[name*="DETOverall"]', type: 'text', description: 'DET Overall Score' },
        { id: 'testDate', selector: '#TestDate, input[name*="TestDate"]', type: 'date', description: 'Test Date' }
      ],
      actions: [
        { id: 'save', selector: '#btnSaveTests, button:has-text("Save")', description: 'Save Test Scores' }
      ]
    },

    // Document Upload Modal
    upload_documents_modal: {
      name: 'Upload Documents Modal',
      identifyBy: { selector: '#uploadPassportModal.show' },
      fields: [
        { id: 'passportUpload', selector: '#passportUploadModal, #fileUploadInput', type: 'file', description: 'Passport Document' },
        { id: 'grade10Upload', selector: '#grade10UploadModal', type: 'file', description: 'Grade 10 Marksheet' },
        { id: 'grade12Upload', selector: '#grade12UploadModal', type: 'file', description: 'Grade 12 Marksheet' },
        { id: 'ugUpload', selector: '#ugUploadModal', type: 'file', description: 'UG Marksheet' },
        { id: 'pgUpload', selector: '#pgUploadModal', type: 'file', description: 'PG Marksheet' },
        { id: 'resumeUpload', selector: '#resumeUploadModal', type: 'file', description: 'Resume' },
        { id: 'englishTestUpload', selector: '#englishTestUploadModal', type: 'file', description: 'English Test Certificate' }
      ],
      actions: [
        { id: 'selectPassport', selector: '#passportCard', description: 'Select Passport card' },
        { id: 'selectGrade10', selector: '#grade10Card', description: 'Select Grade 10 card' },
        { id: 'selectGrade12', selector: '#grade12Card', description: 'Select Grade 12 card' },
        { id: 'selectUG', selector: '#ugDegreeCard', description: 'Select UG Degree card' },
        { id: 'selectPG', selector: '#pgDegreeCard', description: 'Select PG Degree card' },
        { id: 'selectResume', selector: '#resumeCard', description: 'Select Resume card' },
        { id: 'browse', selector: '#browseFilesBtn', description: 'Browse files button' },
        { id: 'autofill', selector: '#autofillButton', description: 'Autofill button', tags: ['submit'] },
        { id: 'close', selector: '#btnOcrCloseModal, .modal .close', description: 'Close modal' }
      ]
    }
  }
};