import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createPayment(@Request() req, @Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentService.createPayment(req.user.userId, createPaymentDto);
  }

  @Get('callback')
  async handleCallback(@Query() query: any) {
    return this.paymentService.handleCallback(query);
  }

  @Get('return')
  async handleReturn(@Query() query: any) {
    return this.paymentService.handleCallback(query);
  }
}

