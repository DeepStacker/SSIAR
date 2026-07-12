from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


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


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class MetricRecordRequest(BaseModel):
    document_id: str
    metric_name: str
    metric_value: float
    metric_unit: str = ""


class BatchFolderRequest(BaseModel):
    folder_path: str
    auto_verify: bool = False


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class UpdateRoleRequest(BaseModel):
    role: str
