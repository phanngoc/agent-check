import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VnpayService } from './vnpay.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private vnpayService: VnpayService,
  ) {}

  async createPayment(userId: string, createPaymentDto: CreatePaymentDto) {
    const { orderId } = createPaymentDto;

    // Get order
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestException('Order is not in pending status');
    }

    // Check if payment already exists
    let payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (payment && payment.status === 'COMPLETED') {
      throw new BadRequestException('Payment already completed');
    }

    // Create or update payment record
    if (!payment) {
      payment = await this.prisma.payment.create({
        data: {
          orderId,
          amount: order.total,
          paymentMethod: 'VNPAY',
          status: 'PENDING',
        },
      });
    }

    // Generate VNPay payment URL
    const paymentUrl = this.vnpayService.createPaymentUrl(
      orderId,
      Number(order.total),
      `Thanh toan don hang ${orderId}`,
    );

    return {
      paymentUrl,
      paymentId: payment.id,
    };
  }

  async handleCallback(vnp_Params: any) {
    const verification = this.vnpayService.verifyReturnUrl(vnp_Params);

    if (!verification.isValid) {
      throw new BadRequestException('Invalid payment signature');
    }

    const orderId = verification.orderId;
    if (!orderId) {
      throw new BadRequestException('Order ID not found');
    }

    // Get payment record
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Update payment status based on response code
    // ResponseCode: '00' means success
    const isSuccess = verification.responseCode === '00';

    await this.prisma.$transaction(async (tx) => {
      // Update payment
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: isSuccess ? 'COMPLETED' : 'FAILED',
          transactionId: vnp_Params['vnp_TransactionNo'] || null,
        },
      });

      // Update order status
      if (isSuccess) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'PROCESSING' },
        });
      }
    });

    return {
      success: isSuccess,
      orderId,
      message: isSuccess ? 'Payment successful' : 'Payment failed',
    };
  }
}

