import { Controller, Get } from "@nestjs/common";

type HealthResponse = {
  success: true;
  data: {
    status: "ok";
    service: "worksync-backend";
  };
};

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      success: true,
      data: {
        status: "ok",
        service: "worksync-backend"
      }
    };
  }
}
