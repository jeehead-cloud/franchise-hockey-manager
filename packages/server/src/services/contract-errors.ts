export class ContractHttpError extends Error { constructor(public statusCode:number,public code:string,message:string,public details?:unknown){super(message);this.name=code;} }
