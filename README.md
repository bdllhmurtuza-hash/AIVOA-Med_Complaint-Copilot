# AIVOA — Med Complaint Copilot

An AI-powered complaint management system designed to help pharmaceutical manufacturing teams capture, review, assess, and manage medical product complaints more efficiently.

NOW YOU CAN LAUCH THE AIVOA-COPILOT DIRECTLY BY CLICKING THIS LINK:
https://aivoa-med-complaint-copilot-1.onrender.com

## Overview

AIVOA — Med Complaint Copilot combines a conversational AI interface with a structured complaint management workflow.

Users can submit complaints through natural language or upload complaint documents. The system extracts the relevant information, identifies missing or inconsistent details, assesses the complaint, and allows the user to review and commit the finalized complaint into the system.

The goal is to make complaint intake and initial assessment faster and more structured while keeping the user involved in the process.

## Key Features

- **Natural-language complaint intake**  
  Submit complaints conversationally instead of filling out a long traditional form.

- **AI-assisted complaint processing**  
  The system extracts and organizes relevant complaint information from user input.

- **Conversational editing**  
  Users can correct or update complaint information through the chat interface.

- **Document upload**  
  Complaint information can be provided through uploaded PDF documents.

- **AI risk assessment**  
  Complaints are evaluated to identify relevant risk information and support the review process.

- **Review before submission**  
  Users can review the generated complaint details before committing them.

- **QMS ledger integration**  
  Finalized complaints can be committed to the complaint management system.

## How It Works

1. The user starts a complaint through the conversational interface.
2. AIVOA collects the relevant complaint information.
3. The AI processes and structures the information.
4. Missing or unclear information can be corrected through conversation.
5. Supporting complaint documents can also be uploaded.
6. The complaint goes through an AI-assisted assessment.
7. The user reviews the final complaint details.
8. Once confirmed, the complaint is committed to the system.

## Tech Stack

### Frontend
- React
- JavaScript
- HTML
- CSS

### Backend
- Python
- FastAPI

### AI / Workflow
- LangGraph
- Openrouter

### Database
- PostGreSQL

## Architecture

The application follows a frontend-backend architecture:

**React Frontend → FastAPI Backend → LangGraph AI Workflow → PostgreSQL**

The frontend provides the user interface, while the FastAPI backend handles application logic and communication with the AI workflow and database.

LangGraph is used to manage the complaint-processing workflow, allowing different stages of the process to be handled in a structured way.


## Getting Started

### Prerequisites

Make sure you have the following installed:

- Python
- Node.js and npm
- MYSQL
- Git

You will also need the required API credentials for the AI services used by the application.

### Clone the Repository

```bash
git clone https://github.com/bdllhmurtuza-hash/AIVOA-Med_Complaint-Copilot.git
cd AIVOA-Med_Complaint-Copilot
```

### Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Create and activate a Python virtual environment:

```bash
python -m venv venv
source venv/bin/activate
```

On Windows:

```bash
venv\Scripts\activate
```

Install the required dependencies:

```bash
pip install -r requirements.txt
```

Configure the required environment variables before starting the backend.

### Frontend Setup

Navigate to the frontend directory:

```bash
cd frontend
```

Install the dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

### Environment Variables

Create the required `.env` files and add the credentials used by the application.

Example:

```env
GROQ_API_KEY=your_api_key
DATABASE_URL=your_database_url
```

Use the variables required by the actual implementation and never commit API keys or other secrets to the repository.


## Why AIVOA?

Traditional complaint intake can involve repetitive data entry, document handling, and manual review.

AIVOA aims to simplify this workflow by combining conversational interaction, document processing, structured data extraction, and AI-assisted assessment in a single application.

The system is designed to assist users rather than completely replace human review.

## Future Improvements

- More advanced complaint classification
- Additional document formats
- Improved AI-assisted risk assessment
- User authentication and role-based access
- Expanded QMS integrations
- Audit history and reporting
- Production deployment and monitoring

## Project Status

AIVOA is an actively developed project and serves as a working prototype demonstrating how AI agents and modern web technologies can be applied to pharmaceutical complaint management.

## Author

**Abdullah Murtuza**

Computer Science Engineering Student  
Machine Learning & Software Development

GitHub: https://github.com/bdllhmurtuza-hash
