from pydantic import BaseModel
from typing import List, Dict, Any



class VerifyDataRequest(BaseModel):
    roll_number: str
    class_val: str
    dob: str
    gender: str
    consent: str
    responses: Dict[str, Any]
    academic_scores: Dict[str, str]
    remarks: str


class BulkRequest(BaseModel):
    doc_ids: List[str]
